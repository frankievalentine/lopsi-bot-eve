/**
 * How a crew member's connected services ask before acting, from its crew.json
 * `approvals`. Each mode is one of eve's approval helpers (eve/tools/approval),
 * applied only to calls that change something:
 *
 * - `always`: every change waits for a person (the default).
 * - `once`: the first change in a chat waits; eve remembers the answer for that
 *   tool for the rest of the chat.
 * - `auto`: eve's decision model reviews each change and asks a person when it
 *   flags one, or when the review fails.
 * - `never`: changes run without asking.
 *
 * Reads run in every mode. For `call_service`, the first call to a new website
 * still asks once whatever the mode, so a credential only goes where a person
 * allowed (connector-domains.ts).
 *
 * @packageDocumentation
 */

import {
  type ApprovalContext,
  type ApprovalPolicy,
  type ApprovalStatus,
  always,
  auto,
  type ConnectionToolAnnotations,
  never,
  once,
} from "eve/tools/approval";
import { APPROVAL_MODES, DEFAULT_APPROVAL_MODE } from "./crew-core.mjs";

export type ApprovalMode = (typeof APPROVAL_MODES)[number];

/** The member's mode from its crew.json; anything missing or unknown is the default. */
export function approvalModeOf(crew: object): ApprovalMode {
  // A member's crew.json is typed from its contents, so it may not list `approvals`.
  const mode = (crew as { readonly approvals?: unknown }).approvals;
  return (APPROVAL_MODES as readonly unknown[]).includes(mode)
    ? (mode as ApprovalMode)
    : DEFAULT_APPROVAL_MODE;
}

/**
 * The reviewer for `auto`: eve's default decision model, through AI Gateway,
 * only on providers that keep no data. It sees the tool's name and input; the
 * credential is never part of either.
 */
const REVIEW = {
  modelOptions: { providerOptions: { gateway: { zeroDataRetention: true } } },
};

/**
 * eve's helper for the mode, for calls that change something. Return its
 * status unchanged: `once()` only remembers answers to prompts it asked for.
 */
export function changeApproval<TInput>(
  mode: ApprovalMode
): ApprovalPolicy<TInput> {
  switch (mode) {
    case "once":
      return once<TInput>();
    case "auto":
      return auto<TInput>(REVIEW);
    case "never":
      return never<TInput>();
    default:
      return always<TInput>();
  }
}

/**
 * Whether an MCP tool says it only reads. A tool that also claims to be
 * destructive contradicts itself, so it doesn't count; MCP defaults
 * `destructiveHint` to true, so only an explicit true counts as one.
 */
export function isReadOnly(
  annotations: ConnectionToolAnnotations | undefined
): boolean {
  return (
    annotations?.readOnlyHint === true && annotations.destructiveHint !== true
  );
}

/**
 * An MCP connector's approval policy (agents/<name>/agent/connections/services.ts):
 * read-only tools run; every other tool, including ones the server says nothing
 * about, follows the member's mode. Annotations are the server's own hints.
 */
export function connectorApproval(mode: ApprovalMode): ApprovalPolicy {
  const changes = changeApproval(mode);
  return (ctx: ApprovalContext): ApprovalStatus | Promise<ApprovalStatus> =>
    isReadOnly(ctx.toolAnnotations) ? "not-applicable" : changes(ctx);
}

/** What a `call_service` request is, for its approval. */
export type ServiceCall = "change" | "new-website" | "read";

/**
 * A `call_service` request: the first call to a website nobody approved for the
 * connector (whatever the method), a read (`GET`) from an approved one, or a
 * change to an approved one.
 */
export function serviceCallKind(call: {
  readonly approvedWebsite: boolean;
  readonly method: string;
}): ServiceCall {
  if (!call.approvedWebsite) {
    return "new-website";
  }
  return call.method === "GET" ? "read" : "change";
}
