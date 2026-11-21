import { describe, expect, it } from "vitest";
import { isSenderEntry, normalizeSender } from "./allowed-senders";

describe("normalizeSender", () => {
  it("lowercases, and drops a Telegram username's @", () => {
    expect(normalizeSender("email", " Ana@Example.com ")).toBe(
      "ana@example.com"
    );
    expect(normalizeSender("telegram", "@Ana_B")).toBe("ana_b");
  });

  it("keeps an email domain's @", () => {
    expect(normalizeSender("email", "@Example.com")).toBe("@example.com");
  });
});

describe("isSenderEntry", () => {
  it.each(["ana@example.com", "@example.com", "a.b+c@mail.example.co"])(
    "takes the email entry %s",
    (entry) => {
      expect(isSenderEntry("email", entry)).toBe(true);
    }
  );

  it.each(["ana", "ana@", "@localhost", "a b@example.com", "a,b@example.com"])(
    "refuses the email entry %s",
    (entry) => {
      expect(isSenderEntry("email", entry)).toBe(false);
    }
  );

  it.each(["ana_b", "123456789"])("takes the Telegram entry %s", (entry) => {
    expect(isSenderEntry("telegram", entry)).toBe(true);
  });

  it.each(["ab", "ana-b", "_ana", "ana@example.com"])(
    "refuses the Telegram entry %s",
    (entry) => {
      expect(isSenderEntry("telegram", entry)).toBe(false);
    }
  );
});
