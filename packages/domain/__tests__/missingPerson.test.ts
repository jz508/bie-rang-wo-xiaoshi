import { describe, expect, it } from "vitest";
import { messageTemplates } from "../src/messageTemplates";
import {
  buildMissingPersonNotificationBatch,
  evaluateMissingPersonPlanTrigger,
  type MissingPersonContact,
} from "../src/missingPerson";

describe("evaluateMissingPersonPlanTrigger", () => {
  const lastConfirmedAt = new Date("2026-06-24T10:00:00Z");

  it("does not trigger before the timeout deadline", () => {
    const result = evaluateMissingPersonPlanTrigger({
      now: new Date("2026-06-24T10:29:59Z"),
      lastConfirmedAt,
      timeoutMinutes: 30,
      planStatus: "active",
    });

    expect(result).toEqual({
      expired: false,
      shouldTrigger: false,
      deadlineAt: new Date("2026-06-24T10:30:00Z"),
      minutesOverdue: 0,
    });
  });

  it("does not trigger an inactive plan even when overdue", () => {
    const result = evaluateMissingPersonPlanTrigger({
      now: new Date("2026-06-24T10:45:00Z"),
      lastConfirmedAt,
      timeoutMinutes: 30,
      planStatus: "paused",
    });

    expect(result.expired).toBe(true);
    expect(result.shouldTrigger).toBe(false);
    expect(result.minutesOverdue).toBe(15);
  });

  it("triggers exactly at the timeout deadline", () => {
    const result = evaluateMissingPersonPlanTrigger({
      now: new Date("2026-06-24T10:30:00Z"),
      lastConfirmedAt,
      timeoutMinutes: 30,
      planStatus: "active",
    });

    expect(result.expired).toBe(true);
    expect(result.shouldTrigger).toBe(true);
    expect(result.minutesOverdue).toBe(0);
  });

  it("does not repeat trigger before the user confirms again", () => {
    const result = evaluateMissingPersonPlanTrigger({
      now: new Date("2026-06-24T11:00:00Z"),
      lastConfirmedAt,
      timeoutMinutes: 30,
      planStatus: "active",
      lastTriggeredAt: new Date("2026-06-24T10:30:01Z"),
    });

    expect(result.expired).toBe(true);
    expect(result.shouldTrigger).toBe(false);
    expect(result.minutesOverdue).toBe(30);
  });

  it("allows a future trigger after the user confirms again", () => {
    const result = evaluateMissingPersonPlanTrigger({
      now: new Date("2026-06-24T12:30:00Z"),
      lastConfirmedAt: new Date("2026-06-24T12:00:00Z"),
      timeoutMinutes: 30,
      planStatus: "active",
      lastTriggeredAt: new Date("2026-06-24T10:30:01Z"),
    });

    expect(result.expired).toBe(true);
    expect(result.shouldTrigger).toBe(true);
    expect(result.minutesOverdue).toBe(0);
  });

  it("accepts triggeredAt as an alias for the last trigger timestamp", () => {
    const result = evaluateMissingPersonPlanTrigger({
      now: new Date("2026-06-24T11:00:00Z"),
      lastConfirmedAt,
      timeoutMinutes: 30,
      planStatus: "active",
      triggeredAt: new Date("2026-06-24T10:30:01Z"),
    });

    expect(result.shouldTrigger).toBe(false);
  });
});

describe("buildMissingPersonNotificationBatch", () => {
  const contacts: MissingPersonContact[] = [
    { id: "contact_enabled_1", enabled: true },
    { id: "contact_disabled", enabled: false },
    { id: "contact_enabled_2", enabled: true },
  ];

  it("filters disabled contacts and creates only enabled notifications", () => {
    const batch = buildMissingPersonNotificationBatch({
      contacts,
      templateId: "contact_or_find_me",
      shortNote: "  bring spare key  ",
    });

    expect(batch.notifications).toEqual([
      {
        contactId: "contact_enabled_1",
        templateId: "contact_or_find_me",
        templateText: messageTemplates[0].text,
        shortNote: "bring spare key",
      },
      {
        contactId: "contact_enabled_2",
        templateId: "contact_or_find_me",
        templateText: messageTemplates[0].text,
        shortNote: "bring spare key",
      },
    ]);
  });

  it("rejects more than three contacts", () => {
    expect(() =>
      buildMissingPersonNotificationBatch({
        contacts: [
          { id: "contact_1", enabled: true },
          { id: "contact_2", enabled: true },
          { id: "contact_3", enabled: true },
          { id: "contact_4", enabled: true },
        ],
        templateId: "contact_or_find_me",
      }),
    ).toThrow("Missing person plan supports at most 3 contacts");
  });

  it("rejects an unknown template id", () => {
    expect(() =>
      buildMissingPersonNotificationBatch({
        contacts,
        templateId: "unknown_template",
      }),
    ).toThrow("Unknown missing person message template id");
  });

  it("rejects disallowed short notes with the shared moderation rule", () => {
    expect(() =>
      buildMissingPersonNotificationBatch({
        contacts,
        templateId: "contact_or_find_me",
        shortNote: "call 13800138000",
      }),
    ).toThrow("Short note contains disallowed contact, promotional, or abuse content");
  });
});
