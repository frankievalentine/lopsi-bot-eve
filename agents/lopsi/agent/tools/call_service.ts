import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import {
  approvalModeOf,
  changeApproval,
  serviceCallKind,
} from "../../../../apps/web/lib/approval-mode.js";
import {
  approveDomain,
  approvedDomains,
} from "../../../../apps/web/lib/connector-domains.js";
import {
  allowedFor,
  type Connector,
  connectors,
} from "../../../../apps/web/lib/connectors.js";
import crew from "../../crew.json" with { type: "json" };

/** The connectors this member may use (crew.json `connectors`); absent is all of them. */
const allowed: readonly string[] | undefined = (
  crew as { connectors?: string[] }
).connectors;

/** How this member asks before a change to an approved website (crew.json `approvals`). */
const changes = changeApproval(approvalModeOf(crew));

/** Where the credential goes in the URL, for APIs that take it in the path (Telegram). */
const TOKEN = "{token}";
/** The most response text the model gets back. */
const MAX_BODY = 20_000;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const input = z.object({
  body: z.unknown().optional().describe("A JSON body, or a string sent as is."),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe("Extra request headers. Never put a credential here."),
  method: z.enum(METHODS),
  service: z.string().describe("The connector's name, from the list above."),
  tokenHeader: z
    .string()
    .optional()
    .describe(
      "A header to send the credential in as is, for APIs that don't take `Authorization: Bearer` (`x-api-key`)."
    ),
  url: z
    .string()
    .url()
    .describe(
      `The full https URL. Write ${TOKEN} where the API wants the credential in the path; otherwise it's sent as \`Authorization: Bearer\`.`
    ),
});

type Input = z.infer<typeof input>;

function hostOf(url: string): string | undefined {
  const parsed = URL.parse(url.replaceAll(TOKEN, "token"));
  return parsed?.protocol === "https:" ? parsed.hostname : undefined;
}

/** The request, with the credential where the API takes it. */
function requestOf(call: Input, token: string): RequestInit {
  const headers = new Headers(call.headers);
  if (!call.url.includes(TOKEN)) {
    headers.set(
      call.tokenHeader ?? "Authorization",
      call.tokenHeader ? token : `Bearer ${token}`
    );
  }
  const json = call.body !== undefined && typeof call.body !== "string";
  if (json && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return {
    ...(call.body === undefined
      ? {}
      : { body: json ? JSON.stringify(call.body) : String(call.body) }),
    headers,
    method: call.method,
    // A redirect elsewhere would carry the credential to a host nobody approved.
    redirect: "manual",
  };
}

function provider(connector: Connector) {
  return connect({
    connector: connector.id,
    displayName: connector.serviceName,
    ...(connector.perPerson ? {} : { principalType: "app" as const }),
  });
}

function describe(list: readonly Connector[]): string {
  const services = list
    .map(
      (connector) =>
        `- ${connector.name}: ${connector.serviceName} (${connector.title})`
    )
    .join("\n");
  return [
    "Call a connected service's HTTP API. Its credential is added on the server: never ask for it, and never put one in the URL or headers yourself.",
    "The first call to a new host for a service, and every call that isn't a GET, waits for a person to approve it, so send reads as GET.",
    `Connected services:\n${services}`,
  ].join("\n\n");
}

/**
 * The connected services that aren't MCP servers (apps/web/lib/connectors.ts):
 * Slack, Stripe, Telegram, Google, anything attached in Vercel Connect. The
 * model writes the request; the credential is added here and never reaches
 * it or the sandbox.
 *
 * Vercel Connect doesn't say where a service's API lives, so the credential
 * goes only to hosts a person approved for that connector
 * (apps/web/lib/connector-domains.ts): without that, a page the crew read
 * could have it send the credential anywhere. Anything but a GET asks too.
 */
export default defineDynamic(async () => {
  const services = allowedFor(await connectors(), allowed).filter(
    (connector) => connector.kind === "api"
  );
  if (services.length === 0) {
    return null;
  }
  const byName = new Map(
    services.map((connector) => [connector.name, connector])
  );

  return defineTool({
    approval: {
      prompt: ({ input: call }: { readonly input: Input }) => {
        const connector = byName.get(call.service);
        return `${call.method} ${call.url.replaceAll(TOKEN, "…")} with ${connector?.serviceName ?? call.service}'s credential?`;
      },
      async request(ctx) {
        const call = ctx.toolInput as Input | undefined;
        const connector = call ? byName.get(call.service) : undefined;
        const host = call ? hostOf(call.url) : undefined;
        if (!(call && connector && host)) {
          // execute() refuses it with what to fix.
          return "not-applicable";
        }
        const approved = await approvedDomains(connector.id);
        switch (
          serviceCallKind({
            approvedWebsite: approved.includes(host),
            method: call.method,
          })
        ) {
          // Whatever the mode: only a person can send a credential somewhere new.
          case "new-website":
            return "user-approval";
          case "read":
            return "not-applicable";
          default:
            return changes(ctx);
        }
      },
    },
    description: describe(services),
    async execute(call: Input, ctx) {
      const connector = byName.get(call.service);
      const host = hostOf(call.url);
      if (!(connector && host)) {
        throw new Error(
          `Use an https URL and one of: ${[...byName.keys()].join(", ")}.`
        );
      }
      const { token } = await ctx.getToken(provider(connector));
      if (ctx.approval !== undefined) {
        // A person allowed this host for the credential; later reads go ahead.
        await approveDomain(connector.id, host);
      }
      let response: Response;
      try {
        response = await fetch(
          call.url.replaceAll(TOKEN, encodeURIComponent(token)),
          requestOf(call, token)
        );
      } catch {
        // biome-ignore lint/style/useErrorCause: the cause could quote a URL with the credential in it.
        throw new Error(`Couldn't reach ${host}.`);
      }
      const text = (await response.text()).replaceAll(token, "[credential]");
      return {
        body: text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}…` : text,
        status: response.status,
        ...(response.headers.get("location")
          ? { location: response.headers.get("location") }
          : {}),
      };
    },
    inputSchema: input,
  });
});
