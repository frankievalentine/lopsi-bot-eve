import { describe, expect, it } from "vitest";
import { addressedMembers, isAllowedSender, memberAddress } from "./email";

const CREW = ["lopsi", "scout"];

function received(data: { cc?: string[]; to?: string[] }) {
  return { data, type: "email.received" };
}

describe("addressedMembers", () => {
  it("finds the members in To and Cc, whatever the display name", () => {
    expect(
      addressedMembers(
        received({
          cc: ["Scout <SCOUT@mail.example.com>"],
          to: ["lopsi@mail.example.com", "ana@example.com"],
        }),
        "mail.example.com",
        CREW
      )
    ).toEqual(["lopsi", "scout"]);
  });

  it("ignores a member's name at another domain", () => {
    expect(
      addressedMembers(
        received({ to: ["lopsi@gmail.com"] }),
        "mail.example.com",
        CREW
      )
    ).toEqual([]);
  });

  it.each([
    [
      "another event",
      { data: { to: ["lopsi@mail.example.com"] }, type: "email.sent" },
    ],
    ["no data", { type: "email.received" }],
    ["not an object", "email"],
  ])("ignores %s", (_case, payload) => {
    expect(addressedMembers(payload, "mail.example.com", CREW)).toEqual([]);
  });
});

describe("isAllowedSender", () => {
  const allowed = ["ana@example.com", "@team.example.com"];

  it("allows a listed address and anyone at a listed domain", () => {
    expect(isAllowedSender("Ana@Example.com", allowed)).toBe(true);
    expect(isAllowedSender("bo@team.example.com", allowed)).toBe(true);
  });

  it("refuses everyone else, and everyone when the list is empty", () => {
    expect(isAllowedSender("bo@example.com", allowed)).toBe(false);
    expect(isAllowedSender("bo@sub.team.example.com", allowed)).toBe(false);
    expect(isAllowedSender("ana@example.com", [])).toBe(false);
  });
});

describe("memberAddress", () => {
  it("is the member at the domain, lowercased", () => {
    expect(memberAddress("lopsi", " Mail.Example.com ")).toBe(
      "lopsi@mail.example.com"
    );
  });
});
