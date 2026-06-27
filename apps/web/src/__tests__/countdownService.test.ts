import { beforeEach, describe, expect, it } from "vitest";
import {
  confirmCountdown,
  pauseCountdown,
  type CountdownRecord,
  type CountdownRepository,
  type DeliveryEventInput,
  type DeliveryPayload,
  type DeliveryResult,
  type DeliverySender,
  type EmergencyContactRecord,
  triggerExpiredCountdowns,
  type PresetMessageRecord,
  TRIGGER_CLAIM_TIMEOUT_MS,
} from "../services/countdownService";

class FakeCountdownRepository implements CountdownRepository {
  countdowns = new Map<string, CountdownRecord>();
  contacts: EmergencyContactRecord[] = [];
  presetMessages: PresetMessageRecord[] = [];
  deliveryEvents: DeliveryEventInput[] = [];
  smsPausedUsers = new Set<string>();
  contactReadError?: Error;
  presetMessageReadError?: Error;
  deliveryEventWriteError?: Error;

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
    const current = this.countdowns.get(input.userId);
    if (!current) {
      throw new Error("Countdown not found for user");
    }

    const updated = { ...current, ...input, triggerClaimedAt: null };
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
    return this.smsPausedUsers.has(userId);
  }

  async findContactsByUserId(userId: string): Promise<EmergencyContactRecord[]> {
    if (this.contactReadError) {
      throw this.contactReadError;
    }

    return this.contacts.filter((contact) => contact.userId === userId);
  }

  async findLatestPresetMessage(userId: string): Promise<PresetMessageRecord | null> {
    if (this.presetMessageReadError) {
      throw this.presetMessageReadError;
    }

    return (
      this.presetMessages
        .filter((message) => message.userId === userId)
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null
    );
  }

  async createDeliveryEvent(event: DeliveryEventInput): Promise<void> {
    if (this.deliveryEventWriteError) {
      throw this.deliveryEventWriteError;
    }

    const duplicate = this.deliveryEvents.some(
      (existing) => existing.idempotencyKey === event.idempotencyKey,
    );
    if (duplicate) {
      return;
    }

    this.deliveryEvents.push(event);
  }

  async markCountdownExpired(countdownId: string): Promise<void> {
    const countdown = [...this.countdowns.values()].find((item) => item.id === countdownId);
    if (countdown) {
      this.countdowns.set(countdown.userId, { ...countdown, status: "expired", triggerClaimedAt: null });
    }
  }

  async pauseCountdown(input: { userId: string; pausedAt: Date }): Promise<CountdownRecord> {
    const countdown = this.countdowns.get(input.userId);
    if (!countdown) {
      throw new Error("Countdown not found for user");
    }

    const updated = { ...countdown, status: "paused" as const, triggerClaimedAt: null };
    this.countdowns.set(input.userId, updated);
    return updated;
  }
}

class FakeDeliverySender implements DeliverySender {
  payloads: DeliveryPayload[] = [];
  result: DeliveryResult = { status: "sent" };
  sendHandler?: (payload: DeliveryPayload) => Promise<DeliveryResult> | DeliveryResult;

  async send(payload: DeliveryPayload): Promise<DeliveryResult> {
    this.payloads.push(payload);
    if (this.sendHandler) {
      return this.sendHandler(payload);
    }

    return this.result;
  }
}

describe("countdown service", () => {
  let repository: FakeCountdownRepository;
  let delivery: FakeDeliverySender;

  beforeEach(() => {
    repository = new FakeCountdownRepository();
    delivery = new FakeDeliverySender();
  });

  it("confirmation reset recomputes expiration and active status", async () => {
    repository.countdowns.set("user-1", {
      id: "countdown-1",
      userId: "user-1",
      durationMinutes: 90,
      lastConfirmedAt: new Date("2026-06-24T00:00:00.000Z"),
      expiresAt: new Date("2026-06-24T01:30:00.000Z"),
      status: "expired",
      triggerClaimedAt: null,
    });

    const updated = await confirmCountdown(
      "user-1",
      new Date("2026-06-24T08:15:00.000Z"),
      repository,
    );

    expect(updated).toMatchObject({
      userId: "user-1",
      status: "active",
      lastConfirmedAt: new Date("2026-06-24T08:15:00.000Z"),
      expiresAt: new Date("2026-06-24T09:45:00.000Z"),
    });
  });

  it("pause stops the active countdown after the user confirms safety", async () => {
    repository.countdowns.set("user-1", {
      id: "countdown-1",
      userId: "user-1",
      durationMinutes: 135,
      lastConfirmedAt: new Date("2026-06-24T08:00:00.000Z"),
      expiresAt: new Date("2026-06-24T10:15:00.000Z"),
      status: "active",
      triggerClaimedAt: new Date("2026-06-24T10:16:00.000Z"),
    });

    const updated = await pauseCountdown(
      "user-1",
      new Date("2026-06-24T09:00:00.000Z"),
      repository,
    );

    expect(updated).toMatchObject({
      id: "countdown-1",
      status: "paused",
      triggerClaimedAt: null,
    });
  });

  it("confirmation creates a missing countdown with the selected minute duration", async () => {
    const created = await confirmCountdown(
      "user-1",
      new Date("2026-06-24T08:15:00.000Z"),
      repository,
      17,
    );

    expect(created).toMatchObject({
      userId: "user-1",
      durationMinutes: 17,
      lastConfirmedAt: new Date("2026-06-24T08:15:00.000Z"),
      expiresAt: new Date("2026-06-24T08:32:00.000Z"),
      status: "active",
    });
  });

  it("does not trigger a countdown before it expires", async () => {
    repository.countdowns.set("user-1", {
      id: "countdown-1",
      userId: "user-1",
      durationMinutes: 60,
      lastConfirmedAt: new Date("2026-06-24T10:00:00.000Z"),
      expiresAt: new Date("2026-06-24T13:00:00.000Z"),
      status: "active",
      triggerClaimedAt: null,
    });
    repository.contacts.push(confirmedContact("contact-1", "user-1"));

    const result = await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });

    expect(result).toEqual({ processedCountdowns: 0, attemptedDeliveries: 0 });
    expect(delivery.payloads).toHaveLength(0);
    expect(repository.deliveryEvents).toHaveLength(0);
    expect(repository.countdowns.get("user-1")?.status).toBe("active");
  });

  it("expired trigger sends only to confirmed contacts", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(
      confirmedContact("contact-1", "user-1"),
      { ...confirmedContact("contact-2", "user-1"), status: "pending" },
    );
    repository.presetMessages.push(presetMessage("user-1", "Please check on me"));

    const result = await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });

    expect(result).toEqual({ processedCountdowns: 1, attemptedDeliveries: 1 });
    expect(delivery.payloads).toHaveLength(1);
    expect(delivery.payloads[0]?.contact.id).toBe("contact-1");
  });

  it("expired trigger sends to at most three confirmed contacts", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(
      confirmedContact("contact-1", "user-1"),
      confirmedContact("contact-2", "user-1"),
      confirmedContact("contact-3", "user-1"),
      confirmedContact("contact-4", "user-1"),
    );

    const result = await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });

    expect(result).toEqual({ processedCountdowns: 1, attemptedDeliveries: 3 });
    expect(delivery.payloads.map((payload) => payload.contact.id)).toEqual([
      "contact-1",
      "contact-2",
      "contact-3",
    ]);
    expect(repository.deliveryEvents.map((event) => event.contactId)).toEqual([
      "contact-1",
      "contact-2",
      "contact-3",
    ]);
  });

  it("email channel preference sends email when the confirmed contact has an email", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push({
      ...confirmedContact("contact-1", "user-1"),
      email: "chenmo@example.com",
    });

    const result = await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
      preferredDeliveryChannel: "email",
    });

    expect(result).toEqual({ processedCountdowns: 1, attemptedDeliveries: 1 });
    expect(delivery.payloads[0]).toMatchObject({
      channel: "email",
      contact: expect.objectContaining({
        id: "contact-1",
        email: "chenmo@example.com",
      }),
    });
    expect(repository.deliveryEvents[0]).toMatchObject({
      contactId: "contact-1",
      channel: "email",
      idempotencyKey: "countdown-1:2026-06-24T11:00:00.000Z:contact-1:email",
    });
  });

  it("email channel preference falls back to SMS when a confirmed contact has no email", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push({
      ...confirmedContact("contact-1", "user-1"),
      email: null,
    });

    await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
      preferredDeliveryChannel: "email",
    });

    expect(delivery.payloads[0]).toMatchObject({
      channel: "sms",
      contact: expect.objectContaining({
        id: "contact-1",
        phone: "13800138000",
      }),
    });
    expect(repository.deliveryEvents[0]?.channel).toBe("sms");
  });

  it("SMS channel preference falls back to email when phone is missing", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push({
      ...confirmedContact("contact-1", "user-1"),
      phone: "",
      email: "chenmo@example.com",
    });

    await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
      preferredDeliveryChannel: "sms",
    });

    expect(delivery.payloads[0]).toMatchObject({
      channel: "email",
      contact: expect.objectContaining({
        id: "contact-1",
        email: "chenmo@example.com",
      }),
    });
    expect(repository.deliveryEvents[0]?.channel).toBe("email");
  });

  it("unconfirmed contacts receive no delivery", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push({ ...confirmedContact("contact-1", "user-1"), status: "pending" });
    repository.presetMessages.push(presetMessage("user-1", "Please check on me"));

    const result = await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });

    expect(result).toEqual({ processedCountdowns: 1, attemptedDeliveries: 0 });
    expect(delivery.payloads).toHaveLength(0);
  });

  it("reported contacts receive no delivery", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push({ ...confirmedContact("contact-1", "user-1"), status: "reported" });
    repository.presetMessages.push(presetMessage("user-1", "Please check on me"));

    const result = await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });

    expect(result).toEqual({ processedCountdowns: 1, attemptedDeliveries: 0 });
    expect(delivery.payloads).toHaveLength(0);
    expect(repository.deliveryEvents).toHaveLength(0);
  });

  it("already paused users do not send SMS countdown deliveries", async () => {
    seedExpiredCountdown(repository);
    repository.smsPausedUsers.add("user-1");
    repository.contacts.push(confirmedContact("contact-1", "user-1"));
    repository.presetMessages.push(presetMessage("user-1", "Please check on me"));

    const result = await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });

    expect(result).toEqual({ processedCountdowns: 1, attemptedDeliveries: 0 });
    expect(delivery.payloads).toHaveLength(0);
    expect(repository.deliveryEvents).toHaveLength(0);
    expect([...repository.countdowns.values()][0]?.status).toBe("expired");
  });

  it("trigger-time moderation rejects bad note and falls back to template-only payload", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(confirmedContact("contact-1", "user-1"));
    repository.presetMessages.push(presetMessage("user-1", "call me at 13800138000"));

    await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });

    expect(delivery.payloads[0]).toMatchObject({
      templateKey: "contact_or_find_me",
    });
    expect(delivery.payloads[0]?.shortNote).toBeUndefined();
  });

  it("delivery events include idempotency and message snapshots", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(confirmedContact("contact-1", "user-1"));
    repository.presetMessages.push(presetMessage("user-1", "Please check on me"));

    await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });

    expect(repository.deliveryEvents).toEqual([
      {
        userId: "user-1",
        countdownId: "countdown-1",
        contactId: "contact-1",
        channel: "sms",
        triggerKey: "countdown-1:2026-06-24T11:00:00.000Z",
        idempotencyKey: "countdown-1:2026-06-24T11:00:00.000Z:contact-1:sms",
        templateKey: "contact_or_find_me",
        templateText: delivery.payloads[0]?.templateText,
        shortNote: "Please check on me",
        status: "sent",
        reason: undefined,
      },
    ]);
  });

  it("claims an expired countdown once across concurrent trigger calls", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(confirmedContact("contact-1", "user-1"));

    const [first, second] = await Promise.all([
      triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
        repository,
        delivery,
      }),
      triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
        repository,
        delivery,
      }),
    ]);

    expect(first.processedCountdowns + second.processedCountdowns).toBe(1);
    expect(first.attemptedDeliveries + second.attemptedDeliveries).toBe(1);
    expect(delivery.payloads).toHaveLength(1);
    expect(repository.deliveryEvents).toHaveLength(1);
    expect([...repository.countdowns.values()][0]?.status).toBe("expired");
  });

  it("records sender exceptions as failed events and continues remaining contacts", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(confirmedContact("contact-1", "user-1"), confirmedContact("contact-2", "user-1"));
    delivery.sendHandler = (payload) => {
      if (payload.contact.id === "contact-1") {
        throw new Error("sms provider unavailable");
      }

      return { status: "sent" };
    };

    const result = await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });

    expect(result).toEqual({ processedCountdowns: 1, attemptedDeliveries: 2 });
    expect(repository.deliveryEvents).toMatchObject([
      {
        contactId: "contact-1",
        status: "failed",
        reason: "sms provider unavailable",
      },
      {
        contactId: "contact-2",
        status: "sent",
        reason: undefined,
      },
    ]);
    expect([...repository.countdowns.values()][0]?.status).toBe("expired");
  });

  it("records failed delivery results returned by the sender", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(confirmedContact("contact-1", "user-1"));
    delivery.result = { status: "failed", reason: "contact opted out" };

    await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });

    expect(repository.deliveryEvents[0]).toMatchObject({
      contactId: "contact-1",
      status: "failed",
      reason: "contact opted out",
    });
  });

  it("leaves a claimed countdown triggering when contact lookup fails before durable events", async () => {
    seedExpiredCountdown(repository);
    repository.contactReadError = new Error("contact database unavailable");

    await expect(
      triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
        repository,
        delivery,
      }),
    ).rejects.toThrow("contact database unavailable");

    expect([...repository.countdowns.values()][0]).toMatchObject({
      status: "triggering",
      triggerClaimedAt: new Date("2026-06-24T12:00:00.000Z"),
    });
    expect(repository.deliveryEvents).toHaveLength(0);
  });

  it("leaves a claimed countdown triggering when preset lookup fails before durable events", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(confirmedContact("contact-1", "user-1"));
    repository.presetMessageReadError = new Error("preset database unavailable");

    await expect(
      triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
        repository,
        delivery,
      }),
    ).rejects.toThrow("preset database unavailable");

    expect([...repository.countdowns.values()][0]).toMatchObject({
      status: "triggering",
      triggerClaimedAt: new Date("2026-06-24T12:00:00.000Z"),
    });
    expect(repository.deliveryEvents).toHaveLength(0);
  });

  it("leaves a claimed countdown triggering when delivery event persistence fails", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(confirmedContact("contact-1", "user-1"));
    repository.deliveryEventWriteError = new Error("delivery event write failed");

    await expect(
      triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
        repository,
        delivery,
      }),
    ).rejects.toThrow("delivery event write failed");

    expect(delivery.payloads).toHaveLength(1);
    expect(repository.deliveryEvents).toHaveLength(0);
    expect([...repository.countdowns.values()][0]).toMatchObject({
      status: "triggering",
      triggerClaimedAt: new Date("2026-06-24T12:00:00.000Z"),
    });
  });

  it("reclaims stale triggering countdowns after the trigger claim timeout", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(confirmedContact("contact-1", "user-1"));
    repository.deliveryEventWriteError = new Error("delivery event write failed");

    await expect(
      triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
        repository,
        delivery,
      }),
    ).rejects.toThrow("delivery event write failed");

    repository.deliveryEventWriteError = undefined;
    const beforeLeaseResult = await triggerExpiredCountdowns(new Date("2026-06-24T12:09:59.999Z"), {
      repository,
      delivery,
    });
    const afterLeaseResult = await triggerExpiredCountdowns(new Date("2026-06-24T12:10:00.000Z"), {
      repository,
      delivery,
    });

    expect(beforeLeaseResult).toEqual({ processedCountdowns: 0, attemptedDeliveries: 0 });
    expect(afterLeaseResult).toEqual({ processedCountdowns: 1, attemptedDeliveries: 1 });
    expect(delivery.payloads).toHaveLength(2);
    expect(repository.deliveryEvents).toHaveLength(1);
    expect([...repository.countdowns.values()][0]).toMatchObject({
      status: "expired",
      triggerClaimedAt: null,
    });
  });

  it("does not retry a partially failed claimed countdown on a later trigger", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(confirmedContact("contact-1", "user-1"), confirmedContact("contact-2", "user-1"));
    delivery.sendHandler = (payload) => {
      if (payload.contact.id === "contact-1") {
        throw new Error("temporary sms failure");
      }

      return { status: "sent" };
    };

    await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });
    await triggerExpiredCountdowns(new Date("2026-06-24T12:01:00.000Z"), {
      repository,
      delivery,
    });

    expect(delivery.payloads).toHaveLength(2);
    expect(repository.deliveryEvents).toHaveLength(2);
    expect(repository.deliveryEvents.map((event) => event.status)).toEqual(["failed", "sent"]);
  });

  it("confirmation after an expired trigger allows a later trigger for the same contacts", async () => {
    seedExpiredCountdown(repository);
    repository.contacts.push(confirmedContact("contact-1", "user-1"));

    await triggerExpiredCountdowns(new Date("2026-06-24T12:00:00.000Z"), {
      repository,
      delivery,
    });
    await confirmCountdown("user-1", new Date("2026-06-24T12:05:00.000Z"), repository, 60);
    await triggerExpiredCountdowns(new Date("2026-06-24T13:05:00.001Z"), {
      repository,
      delivery,
    });

    expect(delivery.payloads).toHaveLength(2);
    expect(repository.deliveryEvents).toHaveLength(2);
    expect(repository.deliveryEvents.map((event) => event.idempotencyKey)).toEqual([
      "countdown-1:2026-06-24T11:00:00.000Z:contact-1:sms",
      "countdown-1:2026-06-24T13:05:00.000Z:contact-1:sms",
    ]);
  });
});

function seedExpiredCountdown(repository: FakeCountdownRepository): void {
  repository.countdowns.set("user-1", {
    id: "countdown-1",
    userId: "user-1",
    durationMinutes: 60,
    lastConfirmedAt: new Date("2026-06-24T10:00:00.000Z"),
    expiresAt: new Date("2026-06-24T11:00:00.000Z"),
    status: "active",
    triggerClaimedAt: null,
  });
}

function confirmedContact(id: string, userId: string): EmergencyContactRecord {
  return {
    id,
    userId,
    phone: "13800138000",
    email: "contact@example.com",
    displayName: "Emergency Contact",
    status: "confirmed",
  };
}

function presetMessage(userId: string, shortNote: string): PresetMessageRecord {
  return {
    id: `message-${userId}`,
    userId,
    templateKey: "contact_or_find_me",
    shortNote,
    reviewStatus: "approved",
    reviewReason: null,
    updatedAt: new Date("2026-06-24T10:30:00.000Z"),
  };
}
