/**
 * Email for the crew: each crew member answers `<member>@LOPSI_EMAIL_DOMAIN`
 * through the Resend channel (agents/<name>/agent/channels/resend.ts), and
 * only from senders Settings allows whose mail passes DMARC.
 *
 * A Resend connector in Vercel Connect receives it: Settings has it send
 * received email to app/api/email, which hands each one to the member it's
 * addressed to, and sets LOPSI_EMAIL_DOMAIN. Thread state needs Upstash Redis
 * (REDIS_URL or KV_URL).
 *
 * @packageDocumentation
 */

/** A member's email address. */
export function memberAddress(memberId: string, domain: string): string {
  return `${memberId}@${domain.trim().toLowerCase()}`;
}

/** Thread state's Redis URL, as the Upstash for Redis integration sets it. */
export function redisStateUrl(): string | undefined {
  return (process.env.REDIS_URL || process.env.KV_URL)?.trim() || undefined;
}

/** The domain the crew receives email at, once Settings has turned email on. */
export function emailDomain(): string | undefined {
  return process.env.LOPSI_EMAIL_DOMAIN?.trim().toLowerCase() || undefined;
}

/** A member's email address while email is on; `undefined` while it's off. */
export function emailSetup(
  memberId: string
): { readonly address: string } | undefined {
  const domain = emailDomain();
  return domain && redisStateUrl()
    ? { address: memberAddress(memberId, domain) }
    : undefined;
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
 * Whether a sender list (apps/web/lib/allowed-senders.ts) allows this
 * address: addresses (`ana@example.com`) and whole domains (`@example.com`).
 * Empty allows nobody.
 */
export function isAllowedSender(
  address: string,
  allowed: readonly string[]
): boolean {
  const sender = address.trim().toLowerCase();
  return allowed.some((entry) =>
    entry.startsWith("@")
      ? domainOf(sender) === entry.slice(1)
      : sender === entry
  );
}

/**
 * The crew members a Resend event is addressed to: `email.received` mail
 * whose To or Cc has `<member>@<domain>`.
 */
export function addressedMembers(
  payload: unknown,
  domain: string,
  memberIds: readonly string[]
): string[] {
  const event = payload as {
    data?: { cc?: unknown; to?: unknown };
    type?: unknown;
  };
  if (event?.type !== "email.received") {
    return [];
  }
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  const recipients = new Set(
    [...list(event.data?.to), ...list(event.data?.cc)].map(bareAddress)
  );
  return memberIds.filter((id) => recipients.has(memberAddress(id, domain)));
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
