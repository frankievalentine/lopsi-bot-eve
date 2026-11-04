/**
 * Email naming shared by the agent's Resend channel (lib/email.ts) and
 * `pnpm setup:email` (scripts/setup-email.mjs), so both agree on each
 * member's address and secret.
 *
 * @packageDocumentation
 */

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
