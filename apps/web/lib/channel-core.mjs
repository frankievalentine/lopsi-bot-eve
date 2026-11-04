/**
 * Channel naming shared by the agent's channels (lib/email.ts,
 * lib/channel-guard.ts) and the setup scripts (setup-email.mjs,
 * setup-channel.mjs), so both agree on addresses, secrets and allowlists.
 *
 * @packageDocumentation
 */

/**
 * The environment variable listing who may reach a channel.
 *
 * @param {string} channel
 * @returns {string}
 */
export function sendersVariable(channel) {
  return `LOPSI_${channel.toUpperCase().replaceAll("-", "_")}_SENDERS`;
}

/**
 * The environment variable holding a member's Resend webhook signing secret.
 *
 * @param {string} memberId
 * @returns {string}
 */
export function webhookSecretVariable(memberId) {
  return `RESEND_WEBHOOK_SECRET_${memberId.toUpperCase().replaceAll("-", "_")}`;
}

/**
 * A member's email address.
 *
 * @param {string} memberId
 * @param {string} domain
 * @returns {string}
 */
export function memberAddress(memberId, domain) {
  return `${memberId}@${domain.trim().toLowerCase()}`;
}

/**
 * Whether every variable a channel's adapter needs is set. Some adapters throw
 * when they're built without them, which would break `eve dev` and builds
 * wherever a channel isn't set up, so a channel builds its adapter only then.
 *
 * @param {readonly string[]} variables
 * @returns {boolean}
 */
export function isConfigured(variables) {
  return variables.every((name) => Boolean(process.env[name]?.trim()));
}

/**
 * Thread state's Redis URL, as the Upstash for Redis integration sets it.
 *
 * @returns {string | undefined}
 */
export function redisStateUrl() {
  return (process.env.REDIS_URL || process.env.KV_URL)?.trim() || undefined;
}
