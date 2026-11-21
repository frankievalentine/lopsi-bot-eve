/**
 * Which images in a reply may load on their own. Loading an image is a
 * request the person never approved: a reply steered by a page or a
 * connector's data could put chat data in an image URL and send it anywhere,
 * past web_fetch's approval and the sandbox's network policy. Only this site's
 * own paths load; every other image shows as a link. (Streamdown already
 * blocks `data:` and `blob:` images before they get here.)
 */
const SAME_SITE_PATH = /^\/(?![/\\])/u;

export function loadsOnItsOwn(src: unknown): src is string {
  return typeof src === "string" && SAME_SITE_PATH.test(src);
}
