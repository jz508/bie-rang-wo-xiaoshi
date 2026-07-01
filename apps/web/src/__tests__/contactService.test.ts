import { beforeEach, describe, expect, it } from "vitest";
import {
  assertCanInvite,
  inviteContact,
  respondToContactInvite,
  type ContactInviteDeliveryGateway,
  type ContactInviteEmailPayload,
  type ContactInviteDeliveryPayload,
  type ContactRepository,
  type ContactRecord,
  type ContactSenderRecord,
} from "../services/contactService";
import {
  MESSAGE_REPORT_SMS_PAUSE_THRESHOLD,
  type AbuseEventInput,
  type MessageReviewRepository,
  type PresetMessageReviewRecord,
} from "../services/messageReviewService";
import { createSignedToken, verifySignedToken } from "../services/tokenService";

class FakeContactRepository implements ContactRepository {
  senders = new Map<string, ContactSenderRecord>();
  contacts = new Map<string, ContactRecord>();
  rollbackSnapshots = new Map<string, ContactRecord | null>();
  nextContactNumber = 1;

  async findSenderById(userId: string): Promise<ContactSenderRecord | null> {
    return this.senders.get(userId) ?? null;
  }

  async upsertPendingContactInviteAtomically(input: {
    userId: string;
    phone: string;
    email?: string | null;
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
      email: input.email ?? null,
      displayName: input.displayName,
      status: "pending",
      lastInviteAt: input.now,
      blockedAt: existing?.blockedAt ?? null,
    };
    this.rollbackSnapshots.set(contact.id, existing ? { ...existing } : null);
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
      const snapshot = this.rollbackSnapshots.get(input.contactId);
      if (snapshot) {
        this.contacts.set(input.contactId, snapshot);
      } else {
        this.contacts.delete(input.contactId);
      }
    }
    this.rollbackSnapshots.delete(input.contactId);
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
}

class FakeContactInviteDelivery implements ContactInviteDeliveryGateway {
  emailPayloads: ContactInviteEmailPayload[] = [];
  payloads: ContactInviteDeliveryPayload[] = [];
  error: Error | null = null;

  async sendInviteEmail(payload: ContactInviteEmailPayload): Promise<void> {
    if (this.error) {
      throw this.error;
    }
    this.emailPayloads.push(payload);
  }

  async sendInviteSms(payload: ContactInviteDeliveryPayload): Promise<void> {
    if (this.error) {
      throw this.error;
    }
    this.payloads.push(payload);
  }
}

class FakeMessageReviewRepository implements MessageReviewRepository {
  abuseEvents: AbuseEventInput[] = [];
  reportedContacts = new Set<string>();
  pausedUsers: { userId: string; pausedAt: Date; reason: string }[] = [];
  recordContactReportError: Error | null = null;

  async savePresetMessageReview(): Promise<PresetMessageReviewRecord> {
    throw new Error("Not needed in contact service tests");
  }

  async recordContactReportOnceAndSuppressContact(input: AbuseEventInput): Promise<{
    reportRecorded: boolean;
    reportsForUser: number;
  }> {
    if (this.recordContactReportError) {
      const error = this.recordContactReportError;
      this.recordContactReportError = null;
      throw error;
    }
    const existing = this.abuseEvents.some(
      (event) =>
        event.userId === input.userId &&
        event.contactId === input.contactId &&
        event.type === input.type,
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

  async pauseSmsTriggerForUser(input: { userId: string; pausedAt: Date; reason: string }): Promise<void> {
    const existing = this.pausedUsers.some(
      (pausedUser) => pausedUser.userId === input.userId && pausedUser.reason === input.reason,
    );
    if (existing) {
      return;
    }
    this.pausedUsers.push(input);
  }
}

describe("contact service", () => {
  const now = new Date("2026-06-24T12:00:00.000Z");
  const tokenSecret = "test-secret";
  let repository: FakeContactRepository;
  let messageReviewRepository: FakeMessageReviewRepository;
  let delivery: FakeContactInviteDelivery;

  beforeEach(() => {
    repository = new FakeContactRepository();
    messageReviewRepository = new FakeMessageReviewRepository();
    delivery = new FakeContactInviteDelivery();
    repository.senders.set("user-1", {
      id: "user-1",
      nickname: "Sender",
      phone: "13800138000",
      phoneVerifiedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
  });

  it("verified sender can invite contact and sends fixed invite template", async () => {
    const result = await inviteContact(
      {
        userId: "user-1",
        phone: "13900139000",
        displayName: "Auntie",
        now,
        tokenSecret,
        confirmationBaseUrl: "https://example.test/c",
      },
      { repository, delivery },
    );

    expect(result.contact).toMatchObject({
      userId: "user-1",
      phone: "13900139000",
      displayName: "Auntie",
      status: "pending",
      lastInviteAt: now,
    });
    expect(delivery.payloads).toEqual([
      {
        toPhone: "13900139000",
        templateId: "contact-confirmation-v1",
        templateVariables: {
          inviterNickname: "Sender",
          confirmationUrl: `https://example.test/c/${result.token}`,
        },
      },
    ]);
  });

  it("manual invite mode creates a pending contact without sending SMS", async () => {
    const result = await inviteContact(
      {
        userId: "user-1",
        phone: "13900139000",
        displayName: "Auntie",
        now,
        tokenSecret,
        confirmationBaseUrl: "https://example.test/c",
        deliveryMode: "manual",
      },
      { repository },
    );

    expect(result.contact).toMatchObject({
      userId: "user-1",
      phone: "13900139000",
      displayName: "Auntie",
      status: "pending",
    });
    expect(result.token).toEqual(expect.any(String));
    expect(repository.contacts.get(result.contact.id)?.status).toBe("pending");
    expect(delivery.payloads).toEqual([]);
    expect(delivery.emailPayloads).toEqual([]);
  });

  it("stores a trimmed contact email for trigger email delivery", async () => {
    const result = await inviteContact(
      {
        userId: "user-1",
        phone: "13900139000",
        email: "  chenmo@example.com  ",
        displayName: "Auntie",
        now,
        tokenSecret,
        confirmationBaseUrl: "https://example.test/c",
      },
      { repository, delivery },
    );

    expect(result.contact).toMatchObject({
      phone: "13900139000",
      email: "chenmo@example.com",
      displayName: "Auntie",
    });
    expect(repository.contacts.get(result.contact.id)?.email).toBe("chenmo@example.com");
  });

  it("sends the contact confirmation invite by email when an email is available", async () => {
    const result = await inviteContact(
      {
        userId: "user-1",
        phone: "13900139000",
        email: "  chenmo@example.com  ",
        displayName: "Auntie",
        now,
        tokenSecret,
        confirmationBaseUrl: "https://example.test/c",
      },
      { repository, delivery },
    );

    expect(delivery.payloads).toEqual([]);
    expect(delivery.emailPayloads).toEqual([
      {
        toEmail: "chenmo@example.com",
        subject: "别让我消失联系人确认",
        text: [
          "Auntie，Sender把你设置为紧急联系人。",
          "请打开下面的链接确认是否接受：",
          `https://example.test/c/${result.token}`,
          "如果你不认识对方，可以在页面中拒绝或举报。",
        ].join("\n"),
        idempotencyKey: `contact-invite:${result.contact.id}:${now.toISOString()}`,
      },
    ]);
  });

  it("unverified sender cannot invite", async () => {
    repository.senders.set("user-1", {
      id: "user-1",
      nickname: "Sender",
      phone: "13800138000",
      phoneVerifiedAt: null,
    });

    await expect(
      inviteContact(
        {
          userId: "user-1",
          phone: "13900139000",
          displayName: "Auntie",
          now,
          tokenSecret,
          confirmationBaseUrl: "https://example.test/c",
        },
        { repository, delivery },
      ),
    ).rejects.toThrow("Sender phone is not verified");
    expect(delivery.payloads).toHaveLength(0);
  });

  it("invite payload contains only fixed-template fields", async () => {
    await inviteContact(
      {
        userId: "user-1",
        phone: "13900139000",
        displayName: "Auntie",
        now,
        tokenSecret,
        confirmationBaseUrl: "https://example.test/c",
      },
      { repository, delivery },
    );

    expect(delivery.payloads[0]).toEqual({
      toPhone: "13900139000",
      templateId: "contact-confirmation-v1",
      templateVariables: {
        inviterNickname: "Sender",
        confirmationUrl: expect.stringMatching(/^https:\/\/example\.test\/c\//),
      },
    });
  });

  it("repeat invite within 30 days while unconfirmed is blocked", async () => {
    repository.contacts.set("contact-1", {
      id: "contact-1",
      userId: "user-1",
      phone: "13900139000",
      email: null,
      displayName: "Auntie",
      status: "pending",
      lastInviteAt: new Date("2026-06-01T12:00:00.000Z"),
      blockedAt: null,
    });

    await expect(
      inviteContact(
        {
          userId: "user-1",
          phone: "13900139000",
          displayName: "Auntie",
          now,
          tokenSecret,
          confirmationBaseUrl: "https://example.test/c",
        },
        { repository, delivery },
      ),
    ).rejects.toThrow("Contact already has a pending invite within 30 days");
    expect(delivery.payloads).toHaveLength(0);
  });

  it("invite after 30 days is allowed if still pending", async () => {
    repository.contacts.set("contact-1", {
      id: "contact-1",
      userId: "user-1",
      phone: "13900139000",
      email: null,
      displayName: "Auntie",
      status: "pending",
      lastInviteAt: new Date("2026-05-24T11:59:59.999Z"),
      blockedAt: null,
    });

    await inviteContact(
      {
        userId: "user-1",
        phone: "13900139000",
        displayName: "Auntie",
        now,
        tokenSecret,
        confirmationBaseUrl: "https://example.test/c",
      },
      { repository, delivery },
    );

    expect(delivery.payloads).toHaveLength(1);
    expect(repository.contacts.size).toBe(1);
    expect(repository.contacts.get("contact-1")?.lastInviteAt).toEqual(now);
  });

  it("declined contact blocks future invites", async () => {
    seedBlockedContact(repository, "declined");

    await expectInviteBlocked(repository, delivery, now, tokenSecret);
  });

  it("opt-out contact blocks future invites", async () => {
    seedBlockedContact(repository, "blocked");

    await expectInviteBlocked(repository, delivery, now, tokenSecret);
  });

  it("reported contact blocks future invites", async () => {
    seedBlockedContact(repository, "reported");

    await expectInviteBlocked(repository, delivery, now, tokenSecret);
  });

  it("delivery failure does not leave a new pending invite or throttle retry", async () => {
    delivery.error = new Error("sms provider unavailable");

    await expect(
      inviteContact(
        {
          userId: "user-1",
          phone: "13900139000",
          displayName: "Auntie",
          now,
          tokenSecret,
          confirmationBaseUrl: "https://example.test/c",
        },
        { repository, delivery },
      ),
    ).rejects.toThrow("sms provider unavailable");

    expect(repository.contacts.size).toBe(0);

    delivery.error = null;
    await inviteContact(
      {
        userId: "user-1",
        phone: "13900139000",
        displayName: "Auntie",
        now,
        tokenSecret,
        confirmationBaseUrl: "https://example.test/c",
      },
      { repository, delivery },
    );

    expect(delivery.payloads).toHaveLength(1);
  });

  it("delivery failure after stale pending re-invite restores the old invite timestamp", async () => {
    const oldLastInviteAt = new Date("2026-05-24T11:59:59.999Z");
    const previousContact: ContactRecord = {
      id: "contact-1",
      userId: "user-1",
      phone: "13900139000",
      email: null,
      displayName: "Auntie",
      status: "pending",
      lastInviteAt: oldLastInviteAt,
      blockedAt: null,
    };
    repository.contacts.set(previousContact.id, previousContact);
    delivery.error = new Error("sms provider unavailable");

    await expect(
      inviteContact(
        {
          userId: "user-1",
          phone: "13900139000",
          displayName: "Auntie updated",
          now,
          tokenSecret,
          confirmationBaseUrl: "https://example.test/c",
        },
        { repository, delivery },
      ),
    ).rejects.toThrow("sms provider unavailable");

    expect(repository.contacts.get("contact-1")).toEqual(previousContact);

    delivery.error = null;
    await inviteContact(
      {
        userId: "user-1",
        phone: "13900139000",
        displayName: "Auntie updated",
        now,
        tokenSecret,
        confirmationBaseUrl: "https://example.test/c",
      },
      { repository, delivery },
    );

    expect(delivery.payloads).toHaveLength(1);
    expect(repository.contacts.get("contact-1")?.lastInviteAt).toEqual(now);
  });

  it("agree response marks contact confirmed", async () => {
    seedPendingContact(repository);
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt: new Date("2026-06-25T12:00:00.000Z"),
      secret: tokenSecret,
    });

    const result = await respondToContactInvite(
      { token, action: "agree", now, tokenSecret },
      { repository },
    );

    expect(result.status).toBe("confirmed");
    expect(repository.contacts.get("contact-1")?.status).toBe("confirmed");
  });

  it("decline, report, and opt_out responses update statuses appropriately", async () => {
    for (const [action, expectedStatus] of [
      ["decline", "declined"],
      ["report", "reported"],
      ["opt_out", "blocked"],
    ] as const) {
      seedPendingContact(repository);
      const token = createSignedToken({
        purpose: "contact-confirmation",
        userId: "user-1",
        contactId: "contact-1",
        expiresAt: new Date("2026-06-25T12:00:00.000Z"),
        secret: tokenSecret,
      });

      const result = await respondToContactInvite(
        { token, action, now, tokenSecret },
        action === "report" ? { repository, messageReviewRepository } : { repository },
      );

      expect(result.status).toBe(expectedStatus);
      if (action === "opt_out") {
        expect(result.blockedAt).toEqual(now);
      }
    }
  });

  it("does not allow a declined invite token to be replayed as agree", async () => {
    seedPendingContact(repository);
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt: new Date("2026-06-25T12:00:00.000Z"),
      secret: tokenSecret,
    });

    await respondToContactInvite({ token, action: "decline", now, tokenSecret }, { repository });

    await expect(
      respondToContactInvite({ token, action: "agree", now, tokenSecret }, { repository }),
    ).rejects.toThrow("Contact invite is no longer pending");
    expect(repository.contacts.get("contact-1")?.status).toBe("declined");
  });

  it("does not allow an opt-out invite token to be replayed as agree", async () => {
    seedPendingContact(repository);
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt: new Date("2026-06-25T12:00:00.000Z"),
      secret: tokenSecret,
    });

    await respondToContactInvite({ token, action: "opt_out", now, tokenSecret }, { repository });

    await expect(
      respondToContactInvite({ token, action: "agree", now, tokenSecret }, { repository }),
    ).rejects.toThrow("Contact invite is no longer pending");
    expect(repository.contacts.get("contact-1")?.status).toBe("blocked");
  });

  it("does not allow a reported invite token to be replayed as agree", async () => {
    seedPendingContact(repository);
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt: new Date("2026-06-25T12:00:00.000Z"),
      secret: tokenSecret,
    });

    await respondToContactInvite(
      { token, action: "report", now, tokenSecret },
      { repository, messageReviewRepository },
    );

    await expect(
      respondToContactInvite({ token, action: "agree", now, tokenSecret }, { repository }),
    ).rejects.toThrow("Contact invite is no longer pending");
    expect(repository.contacts.get("contact-1")?.status).toBe("reported");
  });

  it("reported invite token can replay report to reconcile missing abuse handling", async () => {
    seedPendingContact(repository);
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt: new Date("2026-06-25T12:00:00.000Z"),
      secret: tokenSecret,
    });

    await respondToContactInvite(
      { token, action: "report", now, tokenSecret },
      { repository, messageReviewRepository },
    );
    messageReviewRepository.abuseEvents = [];
    messageReviewRepository.reportedContacts.clear();

    await expect(
      respondToContactInvite({ token, action: "agree", now, tokenSecret }, { repository }),
    ).rejects.toThrow("Contact invite is no longer pending");

    const replay = await respondToContactInvite(
      { token, action: "report", now: new Date(now.getTime() + 1000), tokenSecret },
      { repository, messageReviewRepository },
    );

    expect(replay.status).toBe("reported");
    expect(repository.contacts.get("contact-1")?.status).toBe("reported");
    expect(messageReviewRepository.abuseEvents).toEqual([
      {
        userId: "user-1",
        contactId: "contact-1",
        type: "contact_report",
        reason: "contact_reported_trigger_message",
        createdAt: new Date(now.getTime() + 1000),
      },
    ]);
    expect(messageReviewRepository.reportedContacts.has("user-1:contact-1")).toBe(true);
  });

  it("report response can be retried when abuse handling fails after status update", async () => {
    seedPendingContact(repository);
    messageReviewRepository.recordContactReportError = new Error("abuse store unavailable");
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt: new Date("2026-06-25T12:00:00.000Z"),
      secret: tokenSecret,
    });

    await expect(
      respondToContactInvite(
        { token, action: "report", now, tokenSecret },
        { repository, messageReviewRepository },
      ),
    ).rejects.toThrow("abuse store unavailable");

    expect(repository.contacts.get("contact-1")?.status).toBe("reported");
    expect(messageReviewRepository.abuseEvents).toHaveLength(0);
    expect(messageReviewRepository.reportedContacts.has("user-1:contact-1")).toBe(false);

    const replay = await respondToContactInvite(
      { token, action: "report", now: new Date(now.getTime() + 1000), tokenSecret },
      { repository, messageReviewRepository },
    );

    expect(replay.status).toBe("reported");
    expect(messageReviewRepository.abuseEvents).toEqual([
      {
        userId: "user-1",
        contactId: "contact-1",
        type: "contact_report",
        reason: "contact_reported_trigger_message",
        createdAt: new Date(now.getTime() + 1000),
      },
    ]);
    expect(messageReviewRepository.reportedContacts.has("user-1:contact-1")).toBe(true);
  });

  it("report response records abuse and suppresses the contact", async () => {
    seedPendingContact(repository);
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt: new Date("2026-06-25T12:00:00.000Z"),
      secret: tokenSecret,
    });

    const result = await respondToContactInvite(
      { token, action: "report", now, tokenSecret },
      { repository, messageReviewRepository },
    );

    expect(result.status).toBe("reported");
    expect(messageReviewRepository.abuseEvents).toEqual([
      {
        userId: "user-1",
        contactId: "contact-1",
        type: "contact_report",
        reason: "contact_reported_trigger_message",
        createdAt: now,
      },
    ]);
    expect(messageReviewRepository.reportedContacts.has("user-1:contact-1")).toBe(true);
  });

  it("report response contributes to the SMS pause threshold", async () => {
    seedPendingContact(repository);
    for (let index = 1; index < MESSAGE_REPORT_SMS_PAUSE_THRESHOLD; index += 1) {
      messageReviewRepository.abuseEvents.push({
        userId: "user-1",
        contactId: `previous-contact-${index}`,
        type: "contact_report",
        reason: "contact_reported_trigger_message",
        createdAt: new Date(now.getTime() - index * 1000),
      });
    }
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt: new Date("2026-06-25T12:00:00.000Z"),
      secret: tokenSecret,
    });

    await respondToContactInvite(
      { token, action: "report", now, tokenSecret },
      { repository, messageReviewRepository },
    );

    expect(messageReviewRepository.pausedUsers).toEqual([
      {
        userId: "user-1",
        pausedAt: now,
        reason: "contact_report_threshold_reached",
      },
    ]);
  });

  it("requires the token userId to match the contact owner", async () => {
    seedPendingContact(repository);
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-2",
      contactId: "contact-1",
      expiresAt: new Date("2026-06-25T12:00:00.000Z"),
      secret: tokenSecret,
    });

    await expect(
      respondToContactInvite({ token, action: "agree", now, tokenSecret }, { repository }),
    ).rejects.toThrow("Contact not found");
    expect(repository.contacts.get("contact-1")?.status).toBe("pending");
  });
});

describe("token service", () => {
  const secret = "deterministic-secret";
  const expiresAt = new Date("2026-06-24T13:00:00.000Z");

  it("signed tokens verify for matching purpose", () => {
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt,
      secret,
    });

    expect(
      verifySignedToken(token, {
        purpose: "contact-confirmation",
        secret,
        now: new Date("2026-06-24T12:00:00.000Z"),
      }),
    ).toEqual({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt,
    });
  });

  it("rejects tampered tokens", () => {
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt,
      secret,
    });
    const [payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        purpose: "contact-confirmation",
        userId: "user-2",
        contactId: "contact-1",
        expiresAt: expiresAt.toISOString(),
      }),
    ).toString("base64url");

    expect(() =>
      verifySignedToken(`${tamperedPayload}.${signature ?? ""}`, {
        purpose: "contact-confirmation",
        secret,
        now: new Date("2026-06-24T12:00:00.000Z"),
      }),
    ).toThrow("Token signature is invalid");
    expect(payload).toBeDefined();
  });

  it("rejects expired tokens", () => {
    const token = createSignedToken({
      purpose: "contact-confirmation",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt,
      secret,
    });

    expect(() =>
      verifySignedToken(token, {
        purpose: "contact-confirmation",
        secret,
        now: new Date("2026-06-24T13:00:00.001Z"),
      }),
    ).toThrow("Token has expired");
  });

  it("rejects wrong-purpose tokens", () => {
    const token = createSignedToken({
      purpose: "trigger-message",
      userId: "user-1",
      contactId: "contact-1",
      expiresAt,
      secret,
    });

    expect(() =>
      verifySignedToken(token, {
        purpose: "contact-confirmation",
        secret,
        now: new Date("2026-06-24T12:00:00.000Z"),
      }),
    ).toThrow("Token purpose is invalid");
  });
});

function seedPendingContact(repository: FakeContactRepository): void {
  repository.contacts.set("contact-1", {
    id: "contact-1",
    userId: "user-1",
    phone: "13900139000",
    email: null,
    displayName: "Auntie",
    status: "pending",
    lastInviteAt: new Date("2026-06-24T12:00:00.000Z"),
    blockedAt: null,
  });
}

function seedBlockedContact(
  repository: FakeContactRepository,
  status: "declined" | "blocked" | "reported",
): void {
  repository.contacts.set("contact-1", {
    id: "contact-1",
    userId: "user-1",
    phone: "13900139000",
    email: null,
    displayName: "Auntie",
    status,
    lastInviteAt: new Date("2026-06-01T12:00:00.000Z"),
    blockedAt: new Date("2026-06-01T12:00:00.000Z"),
  });
}

async function expectInviteBlocked(
  repository: FakeContactRepository,
  delivery: FakeContactInviteDelivery,
  now: Date,
  tokenSecret: string,
): Promise<void> {
  await expect(
    inviteContact(
      {
        userId: "user-1",
        phone: "13900139000",
        displayName: "Auntie",
        now,
        tokenSecret,
        confirmationBaseUrl: "https://example.test/c",
      },
      { repository, delivery },
    ),
  ).rejects.toThrow("Contact has blocked future invites");
  expect(delivery.payloads).toHaveLength(0);
}
