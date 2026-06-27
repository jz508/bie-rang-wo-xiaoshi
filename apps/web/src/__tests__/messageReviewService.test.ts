import { beforeEach, describe, expect, it } from "vitest";
import {
  buildTriggerMessagePayload,
  handleContactReport,
  MESSAGE_REPORT_SMS_PAUSE_THRESHOLD,
  reviewAndSavePresetMessage,
  type AbuseEventInput,
  type MessageReviewRepository,
  type PresetMessageReviewRecord,
} from "../services/messageReviewService";

class FakeMessageReviewRepository implements MessageReviewRepository {
  presetMessages: PresetMessageReviewRecord[] = [];
  abuseEvents: AbuseEventInput[] = [];
  reportedContacts = new Set<string>();
  pausedUsers: { userId: string; pausedAt: Date; reason: string }[] = [];
  pauseSmsTriggerError: Error | null = null;

  async savePresetMessageReview(input: {
    userId: string;
    templateKey: PresetMessageReviewRecord["templateKey"];
    shortNote: string;
    reviewStatus: PresetMessageReviewRecord["reviewStatus"];
    reviewReason: string | null;
    now: Date;
  }): Promise<PresetMessageReviewRecord> {
    const record: PresetMessageReviewRecord = {
      id: `message-${this.presetMessages.length + 1}`,
      userId: input.userId,
      templateKey: input.templateKey,
      shortNote: input.shortNote,
      reviewStatus: input.reviewStatus,
      reviewReason: input.reviewReason,
      updatedAt: input.now,
    };
    this.presetMessages.push(record);
    return record;
  }

  async pauseSmsTriggerForUser(input: { userId: string; pausedAt: Date; reason: string }): Promise<void> {
    if (this.pauseSmsTriggerError) {
      const error = this.pauseSmsTriggerError;
      this.pauseSmsTriggerError = null;
      throw error;
    }
    const existing = this.pausedUsers.some(
      (pausedUser) => pausedUser.userId === input.userId && pausedUser.reason === input.reason,
    );
    if (existing) {
      return;
    }
    this.pausedUsers.push(input);
  }

  async recordContactReportOnceAndSuppressContact(input: AbuseEventInput): Promise<{
    reportRecorded: boolean;
    reportsForUser: number;
  }> {
    const reportKey = `${input.userId}:${input.contactId}:${input.type}`;
    const existing = this.abuseEvents.some(
      (event) => `${event.userId}:${event.contactId}:${event.type}` === reportKey,
    );

    if (!existing) {
      this.abuseEvents.push(input);
    }
    this.reportedContacts.add(`${input.userId}:${input.contactId}`);

    return {
      reportRecorded: !existing,
      reportsForUser: this.abuseEvents.filter(
        (event) => event.userId === input.userId && event.type === "contact_report",
      ).length,
    };
  }
}

describe("message review service", () => {
  const now = new Date("2026-06-24T12:00:00.000Z");
  let repository: FakeMessageReviewRepository;

  beforeEach(() => {
    repository = new FakeMessageReviewRepository();
  });

  it("save-time review approves and stores an empty note", async () => {
    const saved = await reviewAndSavePresetMessage(
      {
        userId: "user-1",
        templateKey: "contact_or_find_me",
        shortNote: "",
        now,
      },
      { repository },
    );

    expect(saved).toMatchObject({
      userId: "user-1",
      templateKey: "contact_or_find_me",
      shortNote: "",
      reviewStatus: "approved",
      reviewReason: null,
    });
    expect(repository.presetMessages).toEqual([saved]);
  });

  it("save-time review approves and stores a normalized human short note", async () => {
    const saved = await reviewAndSavePresetMessage(
      {
        userId: "user-1",
        templateKey: "help_confirm_situation",
        shortNote: "  备用钥匙在物业，请先联系我妈妈。  ",
        now,
      },
      { repository },
    );

    expect(saved).toMatchObject({
      templateKey: "help_confirm_situation",
      shortNote: "备用钥匙在物业，请先联系我妈妈。",
      reviewStatus: "approved",
      reviewReason: null,
    });
  });

  it.each([
    "打开 https://example.com 看详情",
    "请打 13800138000 找我",
    "扫码进群有优惠",
  ])("save-time review rejects and stores reason for disallowed content: %s", async (shortNote) => {
    const saved = await reviewAndSavePresetMessage(
      {
        userId: "user-1",
        templateKey: "contact_or_find_me",
        shortNote,
        now,
      },
      { repository },
    );

    expect(saved).toMatchObject({
      shortNote,
      reviewStatus: "rejected",
      reviewReason: "Short note contains disallowed contact, promotional, or abuse content",
    });
  });

  it("save-time review rejects notes longer than 50 characters", async () => {
    const saved = await reviewAndSavePresetMessage(
      {
        userId: "user-1",
        templateKey: "contact_or_find_me",
        shortNote: "备".repeat(51),
        now,
      },
      { repository },
    );

    expect(saved.reviewStatus).toBe("rejected");
    expect(saved.reviewReason).toBe("Short note must be 50 characters or fewer");
  });

  it("save-time review rejects invalid template keys", async () => {
    await expect(
      reviewAndSavePresetMessage(
        {
          userId: "user-1",
          templateKey: "freeform_user_message",
          shortNote: "Please check on me",
          now,
        },
        { repository },
      ),
    ).rejects.toThrow("Invalid message template key");
    expect(repository.presetMessages).toHaveLength(0);
  });

  it("trigger-time review includes approved normalized short note", () => {
    const payload = buildTriggerMessagePayload({
      id: "message-1",
      userId: "user-1",
      templateKey: "contact_family_first",
      shortNote: "  Please check on the spare key.  ",
      reviewStatus: "approved",
      reviewReason: null,
      updatedAt: now,
    });

    expect(payload).toEqual({
      templateKey: "contact_family_first",
      templateText: "如果联系不上我，请先联系我的家人。",
      shortNote: "Please check on the spare key.",
    });
  });

  it("trigger-time review falls back to template-only when latest note is rejected", () => {
    const payload = buildTriggerMessagePayload({
      id: "message-1",
      userId: "user-1",
      templateKey: "help_confirm_situation",
      shortNote: "call me at 13800138000",
      reviewStatus: "approved",
      reviewReason: null,
      updatedAt: now,
    });

    expect(payload).toEqual({
      templateKey: "help_confirm_situation",
      templateText: "我可能遇到了一些情况，请帮我确认一下。",
    });
  });

  it("trigger-time review falls back to the default template when stored template key is invalid", () => {
    const payload = buildTriggerMessagePayload({
      id: "message-1",
      userId: "user-1",
      templateKey: "freeform_user_message",
      shortNote: "Please check on the spare key.",
      reviewStatus: "approved",
      reviewReason: null,
      updatedAt: now,
    });

    expect(payload).toMatchObject({
      templateKey: "contact_or_find_me",
      shortNote: "Please check on the spare key.",
    });
  });

  it("report handling records an abuse event", async () => {
    await handleContactReport(
      {
        userId: "user-1",
        contactId: "contact-1",
        now,
      },
      { repository },
    );

    expect(repository.abuseEvents).toEqual([
      {
        userId: "user-1",
        contactId: "contact-1",
        type: "contact_report",
        reason: "contact_reported_trigger_message",
        createdAt: now,
      },
    ]);
  });

  it("report handling suppresses the contact from future deliveries", async () => {
    await handleContactReport(
      {
        userId: "user-1",
        contactId: "contact-1",
        now,
      },
      { repository },
    );

    expect(repository.reportedContacts.has("user-1:contact-1")).toBe(true);
  });

  it("reaching the report threshold pauses SMS trigger capability", async () => {
    for (let index = 1; index < MESSAGE_REPORT_SMS_PAUSE_THRESHOLD; index += 1) {
      repository.abuseEvents.push({
        userId: "user-1",
        contactId: `previous-contact-${index}`,
        type: "contact_report",
        reason: "contact_reported_trigger_message",
        createdAt: new Date(now.getTime() - index * 1000),
      });
    }

    await handleContactReport(
      {
        userId: "user-1",
        contactId: "contact-3",
        now,
      },
      { repository },
    );

    expect(repository.pausedUsers).toEqual([
      {
        userId: "user-1",
        pausedAt: now,
        reason: "contact_report_threshold_reached",
      },
    ]);
  });

  it("duplicate report replay is idempotent and does not increase report count twice", async () => {
    const first = await handleContactReport(
      {
        userId: "user-1",
        contactId: "contact-1",
        now,
      },
      { repository },
    );
    const second = await handleContactReport(
      {
        userId: "user-1",
        contactId: "contact-1",
        now: new Date(now.getTime() + 1000),
      },
      { repository },
    );

    expect(first).toEqual({ reportsForUser: 1, smsTriggerPaused: false });
    expect(second).toEqual({ reportsForUser: 1, smsTriggerPaused: false });
    expect(repository.abuseEvents).toHaveLength(1);
    expect(repository.pausedUsers).toHaveLength(0);
  });

  it("only distinct new contact reports cross the SMS pause threshold", async () => {
    repository.abuseEvents.push(
      {
        userId: "user-1",
        contactId: "contact-1",
        type: "contact_report",
        reason: "contact_reported_trigger_message",
        createdAt: new Date(now.getTime() - 3000),
      },
      {
        userId: "user-1",
        contactId: "contact-2",
        type: "contact_report",
        reason: "contact_reported_trigger_message",
        createdAt: new Date(now.getTime() - 2000),
      },
    );

    const duplicate = await handleContactReport(
      {
        userId: "user-1",
        contactId: "contact-2",
        now,
      },
      { repository },
    );
    const distinct = await handleContactReport(
      {
        userId: "user-1",
        contactId: "contact-3",
        now: new Date(now.getTime() + 1000),
      },
      { repository },
    );

    expect(duplicate).toEqual({ reportsForUser: 2, smsTriggerPaused: false });
    expect(distinct).toEqual({ reportsForUser: 3, smsTriggerPaused: true });
    expect(repository.abuseEvents).toHaveLength(3);
    expect(repository.pausedUsers).toEqual([
      {
        userId: "user-1",
        pausedAt: new Date(now.getTime() + 1000),
        reason: "contact_report_threshold_reached",
      },
    ]);
  });

  it("duplicate threshold report retries SMS pause after pause write failure without increasing report count", async () => {
    for (let index = 1; index < MESSAGE_REPORT_SMS_PAUSE_THRESHOLD; index += 1) {
      repository.abuseEvents.push({
        userId: "user-1",
        contactId: `previous-contact-${index}`,
        type: "contact_report",
        reason: "contact_reported_trigger_message",
        createdAt: new Date(now.getTime() - index * 1000),
      });
    }
    repository.pauseSmsTriggerError = new Error("pause write unavailable");

    await expect(
      handleContactReport(
        {
          userId: "user-1",
          contactId: "contact-3",
          now,
        },
        { repository },
      ),
    ).rejects.toThrow("pause write unavailable");

    expect(repository.abuseEvents).toHaveLength(MESSAGE_REPORT_SMS_PAUSE_THRESHOLD);
    expect(repository.pausedUsers).toHaveLength(0);

    const replay = await handleContactReport(
      {
        userId: "user-1",
        contactId: "contact-3",
        now: new Date(now.getTime() + 1000),
      },
      { repository },
    );

    expect(replay).toEqual({
      reportsForUser: MESSAGE_REPORT_SMS_PAUSE_THRESHOLD,
      smsTriggerPaused: true,
    });
    expect(repository.abuseEvents).toHaveLength(MESSAGE_REPORT_SMS_PAUSE_THRESHOLD);
    expect(repository.pausedUsers).toEqual([
      {
        userId: "user-1",
        pausedAt: new Date(now.getTime() + 1000),
        reason: "contact_report_threshold_reached",
      },
    ]);
  });
});
