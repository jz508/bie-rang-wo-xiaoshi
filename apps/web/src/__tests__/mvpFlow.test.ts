import { beforeEach, describe, expect, it } from "vitest";
import type { MessageTemplateKey } from "@bie-rang-wo-xiaoshi/domain";
import {
  confirmCountdown,
  type CountdownRecord,
  type CountdownRepository,
  type DeliveryEventInput,
  type DeliveryPayload,
  type DeliveryResult,
  type DeliverySender,
  type EmergencyContactRecord,
  type PresetMessageRecord,
  triggerExpiredCountdowns,
} from "../services/countdownService";
import {
  assertCanInvite,
  inviteContact,
  respondToContactInvite,
  type ContactInviteDeliveryGateway,
  type ContactInviteDeliveryPayload,
  type ContactRecord,
  type ContactRepository,
  type ContactSenderRecord,
} from "../services/contactService";
import {
  type AbuseEventInput,
  type MessageReviewRepository,
  type PresetMessageReviewRecord,
  reviewAndSavePresetMessage,
} from "../services/messageReviewService";
import {
  getContactConfirmationPageData,
  getTriggerMessagePageData,
  type PageDataRepository,
} from "../services/pageDataService";
import { verifySignedToken } from "../services/tokenService";

class MvpRepository
  implements ContactRepository, CountdownRepository, MessageReviewRepository, PageDataRepository
{
  senders = new Map<string, ContactSenderRecord>();
  contacts = new Map<string, ContactRecord>();
  countdowns = new Map<string, CountdownRecord>();
  presetMessages: PresetMessageReviewRecord[] = [];
  deliveryEvents: DeliveryEventInput[] = [];
  abuseEvents: AbuseEventInput[] = [];
  pausedUsers: { userId: string; pausedAt: Date; reason: string }[] = [];
  nextContactNumber = 1;

  async findSenderById(userId: string): Promise<ContactSenderRecord | null> {
    return this.senders.get(userId) ?? null;
  }

  async upsertPendingContactInviteAtomically(input: {
    userId: string;
    phone: string;
    displayName: string;
    now: Date;
    cooldownMs: number;
  }): Promise<ContactRecord> {
    const existing =
      [...this.contacts.values()].find(
        (contact) => contact.userId === input.userId && contact.phone === input.phone,
      ) ?? null;
    assertCanInvite(existing, input.now, input.cooldownMs);

    const contact: ContactRecord = {
      id: existing?.id ?? `contact-${this.nextContactNumber++}`,
      userId: input.userId,
      phone: input.phone,
      email: existing?.email ?? null,
      displayName: input.displayName,
      status: "pending",
      lastInviteAt: input.now,
      blockedAt: existing?.blockedAt ?? null,
    };
    this.contacts.set(contact.id, contact);
    return contact;
  }

  async deleteUnsentPendingContactInvite(input: {
    userId: string;
    contactId: string;
    inviteCreatedAt: Date;
  }): Promise<void> {
    const contact = this.contacts.get(input.contactId);
    if (
      contact?.userId === input.userId &&
      contact.status === "pending" &&
      contact.lastInviteAt?.getTime() === input.inviteCreatedAt.getTime()
    ) {
      this.contacts.delete(input.contactId);
    }
  }

  async updatePendingContactResponse(input: {
    userId: string;
    contactId: string;
    status: ContactRecord["status"];
    now: Date;
    blockedAt?: Date;
    allowReportedReplay?: boolean;
  }): Promise<ContactRecord> {
    const contact = this.contacts.get(input.contactId);
    if (!contact || contact.userId !== input.userId) {
      throw new Error("Contact not found");
    }
    if (contact.status !== "pending") {
      if (input.allowReportedReplay && input.status === "reported" && contact.status === "reported") {
        return contact;
      }
      throw new Error("Contact invite is no longer pending");
    }

    const updated = {
      ...contact,
      status: input.status,
      blockedAt: input.blockedAt ?? contact.blockedAt,
    };
    this.contacts.set(updated.id, updated);
    return updated;
  }

  async findCountdownByUserId(userId: string): Promise<CountdownRecord | null> {
    return this.countdowns.get(userId) ?? null;
  }

  async updateCountdownConfirmation(input: {
    userId: string;
    durationMinutes?: number;
    lastConfirmedAt: Date;
    expiresAt: Date;
    status: CountdownRecord["status"];
  }): Promise<CountdownRecord> {
    const countdown = this.countdowns.get(input.userId);
    if (!countdown) {
      throw new Error("Countdown not found for user");
    }

    const updated = { ...countdown, ...input, triggerClaimedAt: null };
    this.countdowns.set(input.userId, updated);
    return updated;
  }

  async createCountdown(input: {
    userId: string;
    durationMinutes: number;
    lastConfirmedAt: Date;
    expiresAt: Date;
    status: CountdownRecord["status"];
  }): Promise<CountdownRecord> {
    const countdown: CountdownRecord = {
      id: `countdown-${input.userId}`,
      userId: input.userId,
      durationMinutes: input.durationMinutes,
      lastConfirmedAt: input.lastConfirmedAt,
      expiresAt: input.expiresAt,
      status: input.status,
      triggerClaimedAt: null,
    };
    this.countdowns.set(input.userId, countdown);
    return countdown;
  }

  async claimExpiredCountdowns(input: {
    now: Date;
    staleClaimedBefore: Date;
  }): Promise<CountdownRecord[]> {
    const claimed = [...this.countdowns.values()].filter(
      (countdown) =>
        (countdown.status === "active" && countdown.expiresAt.getTime() <= input.now.getTime()) ||
        (countdown.status === "triggering" &&
          countdown.triggerClaimedAt !== null &&
          countdown.triggerClaimedAt.getTime() <= input.staleClaimedBefore.getTime()),
    );

    for (const countdown of claimed) {
      this.countdowns.set(countdown.userId, {
        ...countdown,
        status: "triggering",
        triggerClaimedAt: input.now,
      });
    }

    return claimed.map((countdown) => ({
      ...countdown,
      status: "triggering",
      triggerClaimedAt: input.now,
    }));
  }

  async isSmsTriggerPaused(userId: string): Promise<boolean> {
    return this.pausedUsers.some((pausedUser) => pausedUser.userId === userId);
  }

  async findContactsByUserId(userId: string): Promise<EmergencyContactRecord[]> {
    return [...this.contacts.values()]
      .filter((contact) => contact.userId === userId)
      .map((contact) => ({
        id: contact.id,
        userId: contact.userId,
        phone: contact.phone,
        email: contact.email,
        displayName: contact.displayName,
        status: contact.status,
      }));
  }

  async findLatestPresetMessage(userId: string): Promise<PresetMessageRecord | null> {
    return (
      this.presetMessages
        .filter((message) => message.userId === userId)
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null
    );
  }

  async createDeliveryEvent(event: DeliveryEventInput): Promise<void> {
    const duplicate = this.deliveryEvents.some(
      (existing) => existing.idempotencyKey === event.idempotencyKey,
    );
    if (!duplicate) {
      this.deliveryEvents.push(event);
    }
  }

  async markCountdownExpired(countdownId: string): Promise<void> {
    const countdown = [...this.countdowns.values()].find((item) => item.id === countdownId);
    if (countdown) {
      this.countdowns.set(countdown.userId, {
        ...countdown,
        status: "expired",
        triggerClaimedAt: null,
      });
    }
  }

  async savePresetMessageReview(input: {
    userId: string;
    templateKey: MessageTemplateKey;
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

  async recordContactReportOnceAndSuppressContact(input: AbuseEventInput): Promise<{
    reportRecorded: boolean;
    reportsForUser: number;
  }> {
    const existing = this.abuseEvents.some(
      (event) =>
        event.userId === input.userId &&
        event.contactId === input.contactId &&
        event.type === input.type,
    );

    if (!existing) {
      this.abuseEvents.push(input);
    }

    return {
      reportRecorded: !existing,
      reportsForUser: this.abuseEvents.filter(
        (event) => event.userId === input.userId && event.type === "contact_report",
      ).length,
    };
  }

  async pauseSmsTriggerForUser(input: { userId: string; pausedAt: Date; reason: string }): Promise<void> {
    if (!this.pausedUsers.some((pausedUser) => pausedUser.userId === input.userId)) {
      this.pausedUsers.push(input);
    }
  }

  async findContactConfirmation(input: {
    contactId: string;
    userId: string;
  }): Promise<{
    contactDisplayName: string;
    contactStatus: ContactRecord["status"];
    inviterNickname: string;
  } | null> {
    const contact = this.contacts.get(input.contactId);
    const sender = this.senders.get(input.userId);

    if (!contact || !sender || contact.userId !== input.userId) {
      return null;
    }

    return {
      contactDisplayName: contact.displayName,
      contactStatus: contact.status,
      inviterNickname: sender.nickname,
    };
  }

  async findTriggerMessage(input: {
    contactId: string;
    idempotencyKey: string;
    userId: string;
  }): Promise<{
    contactDisplayName: string;
    contactStatus: ContactRecord["status"];
    shortNote: string | null;
    templateText: string;
    userNickname: string;
  } | null> {
    const event = this.deliveryEvents.find((item) => item.idempotencyKey === input.idempotencyKey);
    const contact = this.contacts.get(input.contactId);
    const sender = this.senders.get(input.userId);

    if (!event || !contact || !sender || event.userId !== input.userId || event.contactId !== input.contactId) {
      return null;
    }

    return {
      contactDisplayName: contact.displayName,
      contactStatus: contact.status,
      shortNote: event.shortNote ?? null,
      templateText: event.templateText,
      userNickname: sender.nickname,
    };
  }
}

class InviteDelivery implements ContactInviteDeliveryGateway {
  payloads: ContactInviteDeliveryPayload[] = [];

  async sendInviteSms(payload: ContactInviteDeliveryPayload): Promise<void> {
    this.payloads.push(payload);
  }
}

class TriggerDelivery implements DeliverySender {
  payloads: DeliveryPayload[] = [];

  async send(payload: DeliveryPayload): Promise<DeliveryResult> {
    this.payloads.push(payload);
    return { status: "sent" };
  }
}

describe("MVP end-to-end service flow", () => {
  const tokenSecret = "mvp-flow-secret";
  const confirmationBaseUrl = "https://bie-rang-wo-xiaoshi.test/c";
  const messageBaseUrl = "https://bie-rang-wo-xiaoshi.test/m";
  let repository: MvpRepository;
  let inviteDelivery: InviteDelivery;
  let triggerDelivery: TriggerDelivery;

  beforeEach(() => {
    repository = new MvpRepository();
    inviteDelivery = new InviteDelivery();
    triggerDelivery = new TriggerDelivery();
    repository.senders.set("user-1", {
      id: "user-1",
      nickname: "小林",
      phone: "13800138000",
      phoneVerifiedAt: new Date("2026-06-24T08:00:00.000Z"),
    });
    repository.countdowns.set("user-1", {
      id: "countdown-1",
      userId: "user-1",
      durationMinutes: 135,
      lastConfirmedAt: new Date("2026-06-24T07:00:00.000Z"),
      expiresAt: new Date("2026-06-24T09:15:00.000Z"),
      status: "active",
      triggerClaimedAt: null,
    });
  });

  it("verifies the onboarding happy path from verified sender to confirmed contact", async () => {
    const invite = await inviteContact(
      {
        userId: "user-1",
        phone: "13900139000",
        displayName: "陈默",
        now: new Date("2026-06-24T08:05:00.000Z"),
        tokenSecret,
        confirmationBaseUrl,
      },
      { repository, delivery: inviteDelivery },
    );
    const confirmationPage = await getContactConfirmationPageData({
      token: invite.token,
      now: new Date("2026-06-24T08:06:00.000Z"),
      secret: tokenSecret,
      repository,
    });
    const message = await reviewAndSavePresetMessage(
      {
        userId: "user-1",
        templateKey: "contact_or_find_me",
        now: new Date("2026-06-24T08:07:00.000Z"),
      },
      { repository },
    );
    const countdown = await confirmCountdown(
      "user-1",
      new Date("2026-06-24T08:10:00.000Z"),
      repository,
    );
    const confirmedContact = await respondToContactInvite(
      {
        token: invite.token,
        action: "agree",
        now: new Date("2026-06-24T08:12:00.000Z"),
        tokenSecret,
      },
      { repository },
    );

    expect(repository.senders.get("user-1")).toMatchObject({
      phoneVerifiedAt: new Date("2026-06-24T08:00:00.000Z"),
      nickname: "小林",
    });
    expect(message).toMatchObject({
      templateKey: "contact_or_find_me",
      shortNote: "",
      reviewStatus: "approved",
    });
    expect(countdown).toMatchObject({
      durationMinutes: 135,
      lastConfirmedAt: new Date("2026-06-24T08:10:00.000Z"),
      expiresAt: new Date("2026-06-24T10:25:00.000Z"),
      status: "active",
    });
    expect(inviteDelivery.payloads).toEqual([
      {
        toPhone: "13900139000",
        templateId: "contact-confirmation-v1",
        templateVariables: {
          inviterNickname: "小林",
          confirmationUrl: `${confirmationBaseUrl}/${invite.token}`,
        },
      },
    ]);
    expect(confirmationPage).toMatchObject({
      kind: "ready",
      inviterNickname: "小林",
      contactDisplayName: "陈默",
      contactStatus: "pending",
    });
    expect(confirmedContact).toMatchObject({
      displayName: "陈默",
      phone: "13900139000",
      status: "confirmed",
    });
    expect(repository.contacts.get(invite.contact.id)?.status).toBe("confirmed");
  });

  it("sends the expired countdown payload only to confirmed contacts and records delivery", async () => {
    await seedConfirmedMvpContact(repository);
    await reviewAndSavePresetMessage(
      {
        userId: "user-1",
        templateKey: "contact_or_find_me",
        shortNote: "",
        now: new Date("2026-06-24T08:07:00.000Z"),
      },
      { repository },
    );
    await confirmCountdown("user-1", new Date("2026-06-24T08:10:00.000Z"), repository);

    const result = await triggerExpiredCountdowns(new Date("2026-06-24T10:25:00.001Z"), {
      repository,
      delivery: triggerDelivery,
      messageBaseUrl,
      messageTokenSecret: tokenSecret,
    });
    const messageUrl = triggerDelivery.payloads[0]?.messageUrl;
    const triggerMessageToken = extractTokenFromUrl(messageUrl, messageBaseUrl);
    const verifiedMessageToken = verifySignedToken(triggerMessageToken, {
      purpose: "trigger-message",
      secret: tokenSecret,
      now: new Date("2026-06-24T10:30:00.000Z"),
    });
    const messagePagePayload = await getTriggerMessagePageData({
      token: triggerMessageToken,
      now: new Date("2026-06-24T10:30:00.000Z"),
      secret: tokenSecret,
      repository,
    });

    expect(result).toEqual({ processedCountdowns: 1, attemptedDeliveries: 1 });
    expect(triggerDelivery.payloads).toEqual([
      expect.objectContaining({
        userId: "user-1",
        contact: expect.objectContaining({
          id: "contact-1",
          phone: "13900139000",
          status: "confirmed",
        }),
        templateKey: "contact_or_find_me",
        templateText: "请联系我，或者来找我。",
        messageUrl: expect.stringMatching(/^https:\/\/bie-rang-wo-xiaoshi\.test\/m\//),
        triggerKey: "countdown-1:2026-06-24T10:25:00.000Z",
        idempotencyKey: "countdown-1:2026-06-24T10:25:00.000Z:contact-1:sms",
      }),
    ]);
    expect(triggerDelivery.payloads.some((payload) => payload.contact.phone === "13800138000")).toBe(false);
    expect(messagePagePayload).toEqual({
      kind: "ready",
      userNickname: "小林",
      contactDisplayName: "陈默",
      templateText: "请联系我，或者来找我。",
    });
    expect(messageUrl).toMatch(/^https:\/\/bie-rang-wo-xiaoshi\.test\/m\//);
    expect(verifiedMessageToken).toMatchObject({
      purpose: "trigger-message",
      userId: "user-1",
      contactId: "contact-1",
      idempotencyKey: "countdown-1:2026-06-24T10:25:00.000Z:contact-1:sms",
    });
    expect(repository.deliveryEvents).toEqual([
      {
        userId: "user-1",
        countdownId: "countdown-1",
        contactId: "contact-1",
        channel: "sms",
        status: "sent",
        triggerKey: "countdown-1:2026-06-24T10:25:00.000Z",
        idempotencyKey: "countdown-1:2026-06-24T10:25:00.000Z:contact-1:sms",
        templateKey: "contact_or_find_me",
        templateText: "请联系我，或者来找我。",
        shortNote: "",
        reason: undefined,
      },
    ]);
  });

  it("prevents MVP abuse cases across invites, notes, trigger review, and opt-out", async () => {
    const firstInvite = await inviteContact(
      {
        userId: "user-1",
        phone: "13900139000",
        displayName: "陈默",
        now: new Date("2026-06-24T08:05:00.000Z"),
        tokenSecret,
        confirmationBaseUrl,
      },
      { repository, delivery: inviteDelivery },
    );

    await expect(
      inviteContact(
        {
          userId: "user-1",
          phone: "13900139000",
          displayName: "陈默",
          now: new Date("2026-06-25T08:05:00.000Z"),
          tokenSecret,
          confirmationBaseUrl,
        },
        { repository, delivery: inviteDelivery },
      ),
    ).rejects.toThrow("Contact already has a pending invite within 30 days");

    const rejectedNote = await reviewAndSavePresetMessage(
      {
        userId: "user-1",
        templateKey: "contact_or_find_me",
        shortNote: "打开 https://example.com 找我",
        now: new Date("2026-06-24T08:06:00.000Z"),
      },
      { repository },
    );
    const unconfirmedResult = await triggerExpiredCountdowns(new Date("2026-06-24T09:16:00.000Z"), {
      repository,
      delivery: triggerDelivery,
    });

    expect(rejectedNote).toMatchObject({
      reviewStatus: "rejected",
      reviewReason: "Short note contains disallowed contact, promotional, or abuse content",
    });
    expect(unconfirmedResult).toEqual({ processedCountdowns: 1, attemptedDeliveries: 0 });
    expect(triggerDelivery.payloads).toHaveLength(0);
    expect(repository.deliveryEvents).toHaveLength(0);

    await respondToContactInvite(
      {
        token: firstInvite.token,
        action: "opt_out",
        now: new Date("2026-06-24T09:20:00.000Z"),
        tokenSecret,
      },
      { repository },
    );
    await expect(
      inviteContact(
        {
          userId: "user-1",
          phone: "13900139000",
          displayName: "陈默",
          now: new Date("2026-07-25T08:05:00.000Z"),
          tokenSecret,
          confirmationBaseUrl,
        },
        { repository, delivery: inviteDelivery },
      ),
    ).rejects.toThrow("Contact has blocked future invites");

    repository.contacts.set("contact-2", {
      id: "contact-2",
      userId: "user-1",
      phone: "13700137000",
      email: null,
      displayName: "周宁",
      status: "confirmed",
      lastInviteAt: new Date("2026-06-24T09:30:00.000Z"),
      blockedAt: null,
    });
    repository.countdowns.set("user-1", {
      id: "countdown-2",
      userId: "user-1",
      durationMinutes: 135,
      lastConfirmedAt: new Date("2026-06-24T10:00:00.000Z"),
      expiresAt: new Date("2026-06-24T12:15:00.000Z"),
      status: "active",
      triggerClaimedAt: null,
    });

    await triggerExpiredCountdowns(new Date("2026-06-24T12:15:00.001Z"), {
      repository,
      delivery: triggerDelivery,
    });

    expect(triggerDelivery.payloads).toEqual([
      expect.objectContaining({
        contact: expect.objectContaining({ id: "contact-2", status: "confirmed" }),
        templateKey: "contact_or_find_me",
        templateText: "请联系我，或者来找我。",
      }),
    ]);
    expect(triggerDelivery.payloads[0]?.shortNote).toBeUndefined();
  });
});

async function seedConfirmedMvpContact(repository: MvpRepository): Promise<void> {
  const inviteDelivery = new InviteDelivery();
  const invite = await inviteContact(
    {
      userId: "user-1",
      phone: "13900139000",
      displayName: "陈默",
      now: new Date("2026-06-24T08:05:00.000Z"),
      tokenSecret: "mvp-flow-secret",
      confirmationBaseUrl: "https://bie-rang-wo-xiaoshi.test/c",
    },
    { repository, delivery: inviteDelivery },
  );

  await respondToContactInvite(
    {
      token: invite.token,
      action: "agree",
      now: new Date("2026-06-24T08:12:00.000Z"),
      tokenSecret: "mvp-flow-secret",
    },
    { repository },
  );
}

function extractTokenFromUrl(messageUrl: string | undefined, messageBaseUrl: string): string {
  expect(messageUrl).toBeDefined();
  const prefix = `${messageBaseUrl}/`;
  expect(messageUrl?.startsWith(prefix)).toBe(true);

  return messageUrl?.slice(prefix.length) ?? "";
}
