/**
 * How the dashboard names a crew member's approval mode (crew.json `approvals`,
 * apps/web/lib/approval-mode.ts), in the Edit form and Settings. Kept apart from
 * approval-mode.ts so the browser doesn't load eve's approval helpers.
 *
 * @packageDocumentation
 */

import type { APPROVAL_MODES } from "./crew-core.mjs";

export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const APPROVAL_LABELS: Record<
  ApprovalMode,
  {
    /** What it does, under the choice. */
    readonly hint: string;
    readonly label: string;
    /** In Settings' Crew tab, beside each service. */
    readonly short: string;
  }
> = {
  always: {
    hint: "Reads just happen. Each comment, post or edit waits for an OK.",
    label: "Ask every time",
    short: "Asks before changes",
  },
  auto: {
    hint: "A reviewer model checks each change and asks when one looks risky or it can't decide. It sees the request, never the credential, through AI Gateway with no data kept.",
    label: "Let a reviewer model decide",
    short: "Reviewer decides",
  },
  never: {
    hint: "Changes run without asking. Anyone who can chat with this member can have it change things through its connected services.",
    label: "Don't ask",
    short: "Doesn't ask",
  },
  once: {
    hint: "The first change in a chat waits for an OK; later changes in that chat run.",
    label: "Ask once per chat",
    short: "Asks once per chat",
  },
};

/** The order the choices are offered in. */
export const APPROVAL_CHOICES: readonly ApprovalMode[] = [
  "always",
  "once",
  "auto",
  "never",
];
