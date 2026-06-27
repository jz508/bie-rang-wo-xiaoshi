import { describe, expect, it } from "vitest";
import { getExpiresAt, getRemainingSeconds } from "../src/countdown";

describe("countdown domain", () => {
  it("rejects durations below one minute", () => {
    expect(() => getExpiresAt(new Date("2026-06-24T00:00:00Z"), 0)).toThrow(
      "Countdown duration must be at least 1 minute",
    );
  });

  it("rejects non-integer durations", () => {
    expect(() => getExpiresAt(new Date("2026-06-24T00:00:00Z"), 1.5)).toThrow(
      "Countdown duration must be at least 1 minute",
    );
  });

  it("rejects an invalid start date", () => {
    expect(() => getExpiresAt(new Date("not-a-date"), 30)).toThrow(
      "Countdown startedAt must be a valid Date",
    );
  });

  it("computes expiration from duration minutes", () => {
    expect(getExpiresAt(new Date("2026-06-24T00:00:00Z"), 135).toISOString()).toBe(
      "2026-06-24T02:15:00.000Z",
    );
  });

  it("returns floored remaining seconds", () => {
    expect(
      getRemainingSeconds(
        new Date("2026-06-24T02:14:00.900Z"),
        new Date("2026-06-24T02:15:00.000Z"),
      ),
    ).toBe(59);
  });

  it("never returns negative remaining seconds", () => {
    expect(
      getRemainingSeconds(
        new Date("2026-06-24T02:16:00Z"),
        new Date("2026-06-24T02:15:00Z"),
      ),
    ).toBe(0);
  });

  it("rejects an invalid current date", () => {
    expect(() =>
      getRemainingSeconds(new Date("not-a-date"), new Date("2026-06-24T02:15:00Z")),
    ).toThrow("Countdown now must be a valid Date");
  });

  it("rejects an invalid expiration date", () => {
    expect(() =>
      getRemainingSeconds(new Date("2026-06-24T02:14:00Z"), new Date("not-a-date")),
    ).toThrow("Countdown expiresAt must be a valid Date");
  });
});
