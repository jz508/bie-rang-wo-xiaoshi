import { describe, expect, it } from "vitest";
import { canSendInvite } from "../src/antiAbuse";

describe("canSendInvite", () => {
  it("allows the first invite", () => {
    expect(canSendInvite(null, new Date("2026-06-24T00:00:00Z"))).toBe(true);
  });

  it("blocks repeat invites within 30 days", () => {
    expect(
      canSendInvite(
        new Date("2026-06-01T00:00:00Z"),
        new Date("2026-06-24T00:00:00Z"),
      ),
    ).toBe(false);
  });

  it("allows invites at the 30-day boundary", () => {
    expect(
      canSendInvite(
        new Date("2026-05-25T00:00:00Z"),
        new Date("2026-06-24T00:00:00Z"),
      ),
    ).toBe(true);
  });
});
