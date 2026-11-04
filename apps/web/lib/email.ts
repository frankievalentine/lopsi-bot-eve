/**
 * Email for the crew: each crew member answers `<member>@LOPSI_EMAIL_DOMAIN`
 * through the Resend channel (agents/<name>/agent/channels/resend.ts), and
 * only from senders you allow whose mail passes DMARC.
 *
 * Set up with `pnpm setup:email`: RESEND_API_KEY, LOPSI_EMAIL_DOMAIN,
 * LOPSI_EMAIL_SENDERS, one webhook signing secret per member
 * (RESEND_WEBHOOK_SECRET_<MEMBER>), and Upstash Redis (REDIS_URL or KV_URL)
 * for thread state.
 *
 * @packageDocumentation
 */

import { memberAddress, webhookSecretVariable } from "./email-core.mjs";

/** Where thread state lives: the Upstash Redis URL the Marketplace integration sets. */
function redisUrl(): string | undefined {
  return (process.env.REDIS_URL || process.env.KV_URL)?.trim() || undefined;
}

/** What a member needs to answer email, or `undefined` while email is off for it. */
export function emailSetup(memberId: string):
  | {
      readonly address: string;
      readonly apiKey: string;
      readonly redisUrl: string;
      readonly webhookSecret: string;
    }
  | undefined {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const domain = process.env.LOPSI_EMAIL_DOMAIN?.trim();
  const webhookSecret = process.env[webhookSecretVariable(memberId)]?.trim();
  const redis = redisUrl();
  if (!(apiKey && domain && webhookSecret && redis)) {
    return;
  }
  return {
    address: memberAddress(memberId, domain),
    apiKey,
    redisUrl: redis,
    webhookSecret,
  };
}

const ANGLE_ADDRESS = /<(?<address>[^>]+)>/u;

/** The bare address in `Name <address>` or `address`, lowercased. */
export function bareAddress(entry: string): string {
  return (ANGLE_ADDRESS.exec(entry)?.groups?.address ?? entry)
    .trim()
    .toLowerCase();
}

function domainOf(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}

/**
 * Whether LOPSI_EMAIL_SENDERS allows this address: a comma-separated list of
 * addresses (`ana@example.com`) and whole domains (`@example.com`). Empty
 * allows nobody.
 */
export function isAllowedSender(address: string): boolean {
  const sender = address.trim().toLowerCase();
  const allowed = (process.env.LOPSI_EMAIL_SENDERS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.some((entry) =>
    entry.startsWith("@")
      ? domainOf(sender) === entry.slice(1)
      : sender === entry
  );
}

const AUTHENTICATION_RESULTS = "authentication-results";
const WHITESPACE = /\s+/u;

/**
 * Whether the receiving server found that the mail really comes from the
 * sender's domain: an Authentication-Results header with `dmarc=pass` for a
 * `header.from` equal to the sender's domain. Anyone can write any From
 * address; DMARC is what ties it to the domain's owner. Fails closed: no
 * header, or anything else, is a no. When LOPSI_EMAIL_AUTHSERV_ID is set, only
 * results from that server count, so a header the sender added can't pass.
 */
export function passesDmarc(
  headers: Readonly<Record<string, string>> | undefined,
  sender: string
): boolean {
  if (!headers) {
    return false;
  }
  const trusted = process.env.LOPSI_EMAIL_AUTHSERV_ID?.trim().toLowerCase();
  const results = Object.entries(headers)
    .filter(([name]) => name.toLowerCase() === AUTHENTICATION_RESULTS)
    .flatMap(([, value]) => value.split("\n"));
  const domain = domainOf(sender);
  return results.some((result) => {
    const [server = "", ...methods] = result
      .split(";")
      .map((part) => part.trim().toLowerCase());
    if (trusted && server.split(WHITESPACE)[0] !== trusted) {
      return false;
    }
    return methods.some(
      (method) =>
        method.startsWith("dmarc=pass") &&
        method.split(WHITESPACE).includes(`header.from=${domain}`)
    );
  });
}
