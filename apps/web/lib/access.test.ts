import { beforeEach, describe, expect, it, vi } from "vitest";

const LONG_PASSWORD = "a-password-long-enough";

const SIGN_IN = {
  BETTER_AUTH_SECRET: "secret-secret-secret-secret-secret-12",
  VERCEL_APP_CLIENT_ID: "cl_test",
  VERCEL_APP_CLIENT_SECRET: "client-secret",
  VERCEL_URL: "mine.vercel.app",
};

/** `lib/access.ts` as a deployment with these variables would load it. */
async function loadWith(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  vi.resetModules();
  return await import("./access");
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  for (const key of [
    ...Object.keys(SIGN_IN),
    "BLOB_READ_WRITE_TOKEN",
    "BLOB_STORE_ID",
    "LOPSI_ACCESS_PASSWORD",
  ]) {
    vi.stubEnv(key, "");
  }
});

describe("accessMode", () => {
  it("locks a deployment with nothing set up", async () => {
    const { accessMode } = await loadWith({});
    expect(accessMode()).toBe("unconfigured");
  });

  it("is open only in local development", async () => {
    const { accessMode } = await loadWith({ NODE_ENV: "development" });
    expect(accessMode()).toBe("open");
  });

  it("uses a long enough password", async () => {
    const { accessMode } = await loadWith({
      LOPSI_ACCESS_PASSWORD: LONG_PASSWORD,
    });
    expect(accessMode()).toBe("password");
  });

  it("locks a deployment whose password is too short", async () => {
    const { accessMode } = await loadWith({ LOPSI_ACCESS_PASSWORD: "short" });
    expect(accessMode()).toBe("too-short");
  });

  it("needs the chat owner store for Sign in with Vercel", async () => {
    const { accessMode } = await loadWith(SIGN_IN);
    expect(accessMode()).toBe("incomplete");
  });

  it("prefers Sign in with Vercel over a password", async () => {
    const { accessMode } = await loadWith({
      ...SIGN_IN,
      BLOB_READ_WRITE_TOKEN: "token",
      LOPSI_ACCESS_PASSWORD: LONG_PASSWORD,
    });
    expect(accessMode()).toBe("vercel");
  });
});

describe("checkAccessPassword", () => {
  it("accepts only the password", async () => {
    const { checkAccessPassword } = await loadWith({
      LOPSI_ACCESS_PASSWORD: LONG_PASSWORD,
    });
    expect(checkAccessPassword(LONG_PASSWORD)).toBe(true);
    expect(checkAccessPassword(`${LONG_PASSWORD}x`)).toBe(false);
    expect(checkAccessPassword("")).toBe(false);
  });

  it("refuses the password once Sign in with Vercel is on", async () => {
    const { checkAccessPassword } = await loadWith({
      ...SIGN_IN,
      BLOB_READ_WRITE_TOKEN: "token",
      LOPSI_ACCESS_PASSWORD: LONG_PASSWORD,
    });
    expect(checkAccessPassword(LONG_PASSWORD)).toBe(false);
  });
});

describe("access tokens", () => {
  it("verifies its own, and not a tampered one", async () => {
    const { signAccessToken, verifyAccessToken } = await loadWith({
      LOPSI_ACCESS_PASSWORD: LONG_PASSWORD,
    });
    const token = signAccessToken();
    await expect(verifyAccessToken(token)).resolves.toBeTruthy();
    await expect(verifyAccessToken(`${token}x`)).resolves.toBeFalsy();
    await expect(verifyAccessToken(undefined)).resolves.toBeFalsy();
  });

  it("stops verifying once the password changes", async () => {
    const before = await loadWith({ LOPSI_ACCESS_PASSWORD: LONG_PASSWORD });
    const token = before.signAccessToken();
    const after = await loadWith({
      LOPSI_ACCESS_PASSWORD: `${LONG_PASSWORD}-new`,
    });
    await expect(after.verifyAccessToken(token)).resolves.toBeFalsy();
  });
});

describe("isTrustedHost", () => {
  it("trusts only the deployment's own hosts", async () => {
    await loadWith({ ...SIGN_IN, BLOB_READ_WRITE_TOKEN: "token" });
    const { isTrustedHost } = await import("./auth");
    expect(isTrustedHost("mine.vercel.app")).toBe(true);
    expect(isTrustedHost("evil.example")).toBe(false);
    expect(isTrustedHost(null)).toBe(false);
  });
});
