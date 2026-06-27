import { describe, expect, expectTypeOf, it } from "vitest";
import {
  countdownStatuses,
  abuseEventTypes,
  deliveryChannels,
  deliveryStatuses,
  type AbuseEvent,
  type Countdown,
  type DeliveryEvent,
  type User,
} from "../src/schemas";

describe("delivery schema types", () => {
  it("exports delivery channels and statuses for MVP delivery events", () => {
    expect(countdownStatuses).toEqual(["active", "triggering", "expired", "paused"]);
    expect(deliveryChannels).toEqual(["sms", "email"]);
    expect(deliveryStatuses).toEqual(["pending", "sent", "failed", "suppressed"]);
    expect(abuseEventTypes).toEqual(["contact_report"]);
  });

  it("defines countdown trigger claim lease state", () => {
    expectTypeOf<Countdown>().toMatchTypeOf<{
      id: string;
      userId: string;
      startedAt: Date;
      durationMinutes: number;
      expiresAt: Date;
      status: "active" | "triggering" | "expired" | "paused";
      triggerClaimedAt: Date | null;
    }>();
  });

  it("defines optional user phone verification timestamp", () => {
    expectTypeOf<User>().toHaveProperty("phoneVerifiedAt").toEqualTypeOf<Date | null | undefined>();
    expectTypeOf<User>().toHaveProperty("smsTriggerPausedAt").toEqualTypeOf<Date | null | undefined>();
    expectTypeOf<User>().toHaveProperty("smsTriggerPausedReason").toEqualTypeOf<string | null | undefined>();
  });

  it("defines the shared delivery event shape", () => {
    expectTypeOf<DeliveryEvent>().toMatchTypeOf<{
      id: string;
      userId: string;
      countdownId: string;
      contactId: string;
      channel: "sms" | "email";
      status: "pending" | "sent" | "failed" | "suppressed";
      reason?: string;
      triggerKey: string;
      idempotencyKey: string;
      templateKey: string;
      templateText: string;
      shortNote?: string;
      createdAt: Date;
    }>();
  });

  it("defines the shared abuse event shape", () => {
    expectTypeOf<AbuseEvent>().toMatchTypeOf<{
      id: string;
      userId: string;
      contactId: string;
      type: "contact_report";
      reason?: string | null;
      createdAt: Date;
    }>();
  });
});
