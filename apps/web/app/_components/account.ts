/** Who is using the dashboard, as the client sees it. */
export type Account =
  | {
      readonly kind: "vercel";
      readonly email: string;
      readonly id: string;
      readonly image?: string;
      readonly name: string;
    }
  | { readonly kind: "password" }
  | { readonly kind: "open" };

/** The key a person's browser-stored chat list is kept under. */
export function ownerOf(account: Account): string {
  switch (account.kind) {
    case "vercel":
      return `vercel:${account.id}`;
    case "password":
      return "operator";
    default:
      return "local";
  }
}
