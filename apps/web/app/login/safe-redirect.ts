const REDIRECT_BASE = "https://placeholder.invalid";

/**
 * Restricts a post-sign-in destination to same-origin paths, preventing open redirects.
 *
 * @param target - The requested destination, e.g. the `redirect` search param.
 * @returns `target` when it is a same-origin path, otherwise `"/"`.
 */
export function safeRedirect(target: string | null | undefined): string {
  if (typeof target !== "string" || !target.startsWith("/")) {
    return "/";
  }
  try {
    const url = new URL(target, REDIRECT_BASE);
    return url.origin === REDIRECT_BASE
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
}
