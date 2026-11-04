"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MemberConfig } from "@/lib/config-changes";
import type {
  MemberAccess,
  ToolSwitch,
  WebFetchMode,
} from "@/lib/member-access";

/** A connector the member can be limited to. */
export interface ConnectorChoice {
  readonly configured: boolean;
  readonly id: string;
  readonly name: string;
}

/** The access part of the Edit form; an absent setting was edited by hand and is read-only. */
export interface AccessForm {
  readonly bash?: ToolSwitch;
  /** `all`, or the ids it's limited to. */
  readonly connectors: "all" | readonly string[];
  /** Sandbox domains, one per line. */
  readonly domains?: string;
  readonly webFetch?: WebFetchMode;
  readonly webSearch?: ToolSwitch;
}

export const NEW_ACCESS: AccessForm = { connectors: "all" };

export function accessFormOf(config: MemberConfig): AccessForm {
  const { access = {}, crew } = config;
  return {
    connectors: crew.connectors ?? "all",
    ...(access.bash === undefined ? {} : { bash: access.bash }),
    ...(access.webSearch === undefined ? {} : { webSearch: access.webSearch }),
    ...(access.webFetch === undefined ? {} : { webFetch: access.webFetch }),
    ...(access.sandboxDomains === undefined
      ? {}
      : { domains: access.sandboxDomains.join("\n") }),
  };
}

/** The settings the form sets: crew.json's connectors, and the access files. */
export function accessOf(form: AccessForm): {
  readonly access: MemberAccess;
  readonly connectors?: string[];
} {
  return {
    access: {
      ...(form.bash === undefined ? {} : { bash: form.bash }),
      ...(form.webSearch === undefined ? {} : { webSearch: form.webSearch }),
      ...(form.webFetch === undefined ? {} : { webFetch: form.webFetch }),
      ...(form.domains === undefined
        ? {}
        : {
            sandboxDomains: form.domains
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          }),
    },
    ...(form.connectors === "all" ? {} : { connectors: [...form.connectors] }),
  };
}

const WEB_FETCH: Record<WebFetchMode, string> = {
  always: "On, asks before every URL",
  never: "On, never asks (set in the file)",
  off: "Off",
  once: "On, asks once per chat (later fetches in it don't ask)",
};

function Hint({ children }: { readonly children: string }) {
  return <span className="text-muted-foreground text-xs">{children}</span>;
}

function ByHand({ file }: { readonly file: string }) {
  return <Hint>{`${file} was edited by hand; change it there.`}</Hint>;
}

function Toggle({
  checked,
  description,
  label,
  onChange,
}: {
  readonly checked: boolean;
  readonly description: string;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        checked={checked}
        className="accent-primary mt-0.5 size-4"
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
      />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <Hint>{description}</Hint>
      </span>
    </label>
  );
}

function ConnectorsField({
  choices,
  onChange,
  value,
}: {
  readonly choices: readonly ConnectorChoice[];
  readonly onChange: (value: AccessForm["connectors"]) => void;
  readonly value: AccessForm["connectors"];
}) {
  const limited = value !== "all";
  const selected = new Set(limited ? value : []);
  return (
    <fieldset className="flex flex-col gap-2 text-sm">
      <legend className="mb-1.5 font-medium">Connectors</legend>
      <Toggle
        checked={limited}
        description="Off: every connector set up for the crew. On: only the ones checked below."
        label="Limit to some connectors"
        onChange={(on) => onChange(on ? [...selected] : "all")}
      />
      {limited ? (
        <div className="flex flex-col gap-1.5 pl-6">
          {choices.map((choice) => (
            <label className="flex items-center gap-2" key={choice.id}>
              <input
                checked={selected.has(choice.id)}
                className="accent-primary size-4"
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) {
                    next.add(choice.id);
                  } else {
                    next.delete(choice.id);
                  }
                  onChange([...next].sort());
                }}
                type="checkbox"
              />
              <span>{choice.name}</span>
              {choice.configured ? null : <Hint>(not set up yet)</Hint>}
            </label>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

function ToolsField({
  onChange,
  value,
}: {
  readonly onChange: (value: AccessForm) => void;
  readonly value: AccessForm;
}) {
  return (
    <fieldset className="flex flex-col gap-3 text-sm">
      <legend className="mb-1.5 font-medium">Tools</legend>
      {value.bash === undefined ? (
        <ByHand file="tools/bash.ts" />
      ) : (
        <Toggle
          checked={value.bash === "on"}
          description="Run commands and work with files in its sandbox."
          label="Shell"
          onChange={(on) => onChange({ ...value, bash: on ? "on" : "off" })}
        />
      )}
      {value.webSearch === undefined ? (
        <ByHand file="tools/web_search.ts" />
      ) : (
        <Toggle
          checked={value.webSearch === "on"}
          description="Search the web through AI Gateway."
          label="Web search"
          onChange={(on) =>
            onChange({ ...value, webSearch: on ? "on" : "off" })
          }
        />
      )}
      {value.webFetch === undefined ? (
        <ByHand file="tools/web_fetch.ts" />
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Web pages</span>
          <Hint>
            Fetching a page runs outside the sandbox, so a URL could carry chat
            data away; asking every time lets the person see each one.
          </Hint>
          <Select
            items={Object.entries(WEB_FETCH)
              .filter(
                ([mode]) => mode !== "never" || value.webFetch === "never"
              )
              .map(([mode, label]) => ({ label, value: mode }))}
            onValueChange={(next: WebFetchMode | null) =>
              next && onChange({ ...value, webFetch: next })
            }
            value={value.webFetch}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["always", "once", "off"] as const).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {WEB_FETCH[mode]}
                </SelectItem>
              ))}
              {value.webFetch === "never" ? (
                <SelectItem value="never">{WEB_FETCH.never}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
      )}
    </fieldset>
  );
}

/**
 * What a crew member may use: connectors (crew.json), built-in tools and the
 * sandbox's network (its tools/ and sandbox.ts). A new member gets the
 * template member's tools and network; edit them once it's added.
 */
export function AccessFields({
  choices,
  editing,
  onChange,
  value,
}: {
  readonly choices: readonly ConnectorChoice[];
  readonly editing: boolean;
  readonly onChange: (value: AccessForm) => void;
  readonly value: AccessForm;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-3">
      <ConnectorsField
        choices={choices}
        onChange={(connectors) => onChange({ ...value, connectors })}
        value={value.connectors}
      />
      {editing ? (
        <>
          <ToolsField onChange={onChange} value={value} />
          {value.domains === undefined ? (
            <ByHand file="sandbox.ts" />
          ) : (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Sandbox network</span>
              <Hint>
                Domains the shell may reach on Vercel, one per line (such as
                registry.npmjs.org). Empty means no network. Each domain is a
                way out for data the crew reads.
              </Hint>
              <Textarea
                className="min-h-16 font-mono text-[13px]"
                onChange={(e) =>
                  onChange({ ...value, domains: e.target.value })
                }
                placeholder="No network"
                value={value.domains}
              />
            </label>
          )}
        </>
      ) : (
        <Hint>
          Tools and the sandbox's network start as the template member's; edit
          them once this member is added.
        </Hint>
      )}
    </div>
  );
}
