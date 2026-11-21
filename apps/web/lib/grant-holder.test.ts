import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATOR } from "./access";
import { grantSubject } from "./connectors";
import { grantHolder } from "./grant-holder";
import { SIGNED_IN_AUTHENTICATOR } from "./session-owners";

const account = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("./current-account", () => ({
  currentAccount: () => Promise.resolve(account.current),
}));

/**
 * The Vercel Connect subject eve's connections use for a user caller: its
 * issuer, or else its authenticator (eve's resolveConnectionPrincipal).
 */
function agentSubject(caller: {
  readonly authenticator: string;
  readonly issuer?: string;
  readonly principalId: string;
}) {
  return {
    id: caller.principalId,
    issuer: caller.issuer ?? caller.authenticator,
    type: "user" as const,
  };
}

describe("grantHolder", () => {
  beforeEach(() => {
    account.current = undefined;
  });

  it("names the grant a Sign in with Vercel chat holds", async () => {
    account.current = { id: "user_1", kind: "vercel", name: "Ana" };
    const holder = await grantHolder();
    expect(holder).toBeDefined();
    // channels/eve.ts's caller for a signed-in person sets no issuer.
    expect(grantSubject(holder as NonNullable<typeof holder>)).toEqual(
      agentSubject({
        authenticator: SIGNED_IN_AUTHENTICATOR,
        principalId: "user_1",
      })
    );
  });

  it("names the grant the shared password's identity holds", async () => {
    account.current = { kind: "password" };
    const holder = await grantHolder();
    expect(grantSubject(holder as NonNullable<typeof holder>)).toEqual(
      agentSubject(OPERATOR)
    );
  });

  it("has nobody to hold a grant locally or in the demo", async () => {
    account.current = { kind: "open" };
    expect(await grantHolder()).toBeUndefined();
    account.current = { kind: "demo" };
    expect(await grantHolder()).toBeUndefined();
  });
});
