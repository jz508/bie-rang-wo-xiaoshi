import {
  type CountdownStatus,
  type DeliveryChannel,
  type DeliveryStatus,
  type EmergencyContactStatus,
  getExpiresAt,
  MAX_MISSING_PERSON_CONTACTS,
  type MessageReviewStatus,
} from "@bie-rang-wo-xiaoshi/domain";
import { buildTriggerMessagePayload } from "./messageReviewService";
import { createSignedToken } from "./tokenService";

export type CountdownRecord = {
  id: string;
  userId: string;
  durationMinutes: number;
  lastConfirmedAt: Date;
  expiresAt: Date;
  status: CountdownStatus;
  triggerClaimedAt: Date | null;
};

export type EmergencyContactRecord = {
  id: string;
  userId: string;
  phone: string;
  email: string | null;
  displayName: string;
  status: EmergencyContactStatus;
};

export type PresetMessageRecord = {
  id: string;
  userId: string;
  templateKey: string;
  shortNote: string;
  reviewStatus: MessageReviewStatus;
  reviewReason: string | null;
  updatedAt: Date;
};

export type DeliveryEventInput = {
  userId: string;
  countdownId: string;
  contactId: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  triggerKey: string;
  idempotencyKey: string;
  templateKey: string;
  templateText: string;
  shortNote?: string;
  reason?: string;
};

export type DeliveryPayload = {
  userId: string;
  channel: DeliveryChannel;
  contact: EmergencyContactRecord;
  templateKey: string;
  templateText: string;
  shortNote?: string;
  messageUrl: string;
  triggerKey: string;
  idempotencyKey: string;
};

export type DeliveryResult = {
  status: DeliveryStatus;
  reason?: string;
};

export type CountdownRepository = {
  findCountdownByUserId(userId: string): Promise<CountdownRecord | null>;
  createCountdown(input: {
    userId: string;
    durationMinutes: number;
    lastConfirmedAt: Date;
    expiresAt: Date;
    status: CountdownStatus;
  }): Promise<CountdownRecord>;
  updateCountdownConfirmation(input: {
    userId: string;
    durationMinutes?: number;
    lastConfirmedAt: Date;
    expiresAt: Date;
    status: CountdownStatus;
  }): Promise<CountdownRecord>;
  pauseCountdown(input: {
    userId: string;
    pausedAt: Date;
  }): Promise<CountdownRecord>;
  claimExpiredCountdowns(input: {
    now: Date;
    staleClaimedBefore: Date;
  }): Promise<CountdownRecord[]>;
  isSmsTriggerPaused(userId: string): Promise<boolean>;
  findContactsByUserId(userId: string): Promise<EmergencyContactRecord[]>;
  findLatestPresetMessage(userId: string): Promise<PresetMessageRecord | null>;
  createDeliveryEvent(event: DeliveryEventInput): Promise<void>;
  markCountdownExpired(countdownId: string): Promise<void>;
};

export type DeliverySender = {
  send(payload: DeliveryPayload): Promise<DeliveryResult>;
};

export type TriggerExpiredCountdownsResult = {
  processedCountdowns: number;
  attemptedDeliveries: number;
};

export type TriggerExpiredCountdownsOptions = {
  repository?: CountdownRepository;
  delivery?: DeliverySender;
  messageBaseUrl?: string;
  messageTokenSecret?: string;
  messageTokenTtlMs?: number;
  preferredDeliveryChannel?: DeliveryChannel | "auto";
};

const ACTIVE_STATUS = "active";
const TRIGGERING_STATUS = "triggering";
const EXPIRED_STATUS = "expired";
const PAUSED_STATUS = "paused";
const CONFIRMED_CONTACT_STATUS = "confirmed";
const FAILED_DELIVERY_STATUS = "failed";
const DEFAULT_MESSAGE_BASE_URL = "http://localhost:3000/m";
const DEFAULT_MESSAGE_TOKEN_SECRET = "development-trigger-message-secret";
const DEFAULT_MESSAGE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const TRIGGER_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

export async function confirmCountdown(
  userId: string,
  now: Date,
  repository: CountdownRepository = unconfiguredRepository,
  durationMinutes?: number,
): Promise<CountdownRecord> {
  const countdown = await repository.findCountdownByUserId(userId);
  const nextDurationMinutes = durationMinutes ?? countdown?.durationMinutes ?? 135;

  if (!countdown) {
    return repository.createCountdown({
      userId,
      durationMinutes: nextDurationMinutes,
      lastConfirmedAt: now,
      expiresAt: getExpiresAt(now, nextDurationMinutes),
      status: ACTIVE_STATUS,
    });
  }

  return repository.updateCountdownConfirmation({
    userId,
    durationMinutes: nextDurationMinutes,
    lastConfirmedAt: now,
    expiresAt: getExpiresAt(now, nextDurationMinutes),
    status: ACTIVE_STATUS,
  });
}

export async function pauseCountdown(
  userId: string,
  now: Date,
  repository: CountdownRepository = unconfiguredRepository,
): Promise<CountdownRecord> {
  return repository.pauseCountdown({
    userId,
    pausedAt: now,
  });
}

export async function triggerExpiredCountdowns(
  now: Date,
  options: TriggerExpiredCountdownsOptions = {},
): Promise<TriggerExpiredCountdownsResult> {
  const repository = options.repository ?? unconfiguredRepository;
  const delivery = options.delivery ?? unconfiguredDelivery;
  const expiredCountdowns = await repository.claimExpiredCountdowns({
    now,
    staleClaimedBefore: new Date(now.getTime() - TRIGGER_CLAIM_TIMEOUT_MS),
  });
  let attemptedDeliveries = 0;

  for (const countdown of expiredCountdowns) {
    const smsTriggerPaused = await repository.isSmsTriggerPaused(countdown.userId);
    const contacts = await repository.findContactsByUserId(countdown.userId);
    const confirmedContacts = contacts
      .filter((contact) => contact.status === CONFIRMED_CONTACT_STATUS)
      .slice(0, MAX_MISSING_PERSON_CONTACTS);
    const message = await repository.findLatestPresetMessage(countdown.userId);
    const payloadMessage = buildTriggerMessagePayload(message);
    const triggerKey = buildTriggerKey(countdown);

    for (const contact of confirmedContacts) {
      const channel = getDeliveryChannel(contact, options.preferredDeliveryChannel ?? "auto");
      if (!channel) {
        continue;
      }
      if (smsTriggerPaused && channel === "sms") {
        continue;
      }

      const idempotencyKey = buildDeliveryIdempotencyKey(triggerKey, contact.id, channel);
      const messageUrl = buildTriggerMessageUrl({
        baseUrl: options.messageBaseUrl ?? DEFAULT_MESSAGE_BASE_URL,
        contactId: contact.id,
        expiresAt: new Date(now.getTime() + (options.messageTokenTtlMs ?? DEFAULT_MESSAGE_TOKEN_TTL_MS)),
        idempotencyKey,
        secret: options.messageTokenSecret ?? DEFAULT_MESSAGE_TOKEN_SECRET,
        userId: countdown.userId,
      });
      attemptedDeliveries += 1;

      const result = await sendDelivery(delivery, {
        userId: countdown.userId,
        channel,
        contact,
        ...payloadMessage,
        messageUrl,
        triggerKey,
        idempotencyKey,
      });

      await repository.createDeliveryEvent({
        userId: countdown.userId,
        countdownId: countdown.id,
        contactId: contact.id,
        channel,
        triggerKey,
        idempotencyKey,
        ...payloadMessage,
        status: result.status,
        reason: result.reason,
      });
    }

    await repository.markCountdownExpired(countdown.id);
  }

  return {
    processedCountdowns: expiredCountdowns.length,
    attemptedDeliveries,
  };
}

async function sendDelivery(delivery: DeliverySender, payload: DeliveryPayload): Promise<DeliveryResult> {
  try {
    return await delivery.send(payload);
  } catch (error) {
    return {
      status: FAILED_DELIVERY_STATUS,
      reason: getErrorReason(error),
    };
  }
}

function getErrorReason(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Delivery sender threw";
}

function buildTriggerKey(countdown: CountdownRecord): string {
  return `${countdown.id}:${countdown.expiresAt.toISOString()}`;
}

function buildDeliveryIdempotencyKey(
  triggerKey: string,
  contactId: string,
  channel: DeliveryChannel,
): string {
  return `${triggerKey}:${contactId}:${channel}`;
}

export function buildTriggerMessageUrl(input: {
  baseUrl: string;
  contactId: string;
  expiresAt: Date;
  idempotencyKey: string;
  secret: string;
  userId: string;
}): string {
  const token = createSignedToken({
    purpose: "trigger-message",
    userId: input.userId,
    contactId: input.contactId,
    idempotencyKey: input.idempotencyKey,
    expiresAt: input.expiresAt,
    secret: input.secret,
  });

  return `${input.baseUrl.replace(/\/+$/, "")}/${token}`;
}

function getDeliveryChannel(
  contact: EmergencyContactRecord,
  preferredChannel: DeliveryChannel | "auto",
): DeliveryChannel | null {
  if (preferredChannel === "email") {
    return contact.email ? "email" : null;
  }

  if (preferredChannel === "sms") {
    return contact.phone ? "sms" : null;
  }

  return contact.phone ? "sms" : contact.email ? "email" : null;
}

const unconfiguredRepository: CountdownRepository = {
  async findCountdownByUserId(): Promise<CountdownRecord | null> {
    throw new Error("Countdown repository is not configured");
  },
  async createCountdown(): Promise<CountdownRecord> {
    throw new Error("Countdown repository is not configured");
  },
  async updateCountdownConfirmation(): Promise<CountdownRecord> {
    throw new Error("Countdown repository is not configured");
  },
  async pauseCountdown(): Promise<CountdownRecord> {
    throw new Error("Countdown repository is not configured");
  },
  async claimExpiredCountdowns(): Promise<CountdownRecord[]> {
    throw new Error("Countdown repository is not configured");
  },
  async isSmsTriggerPaused(): Promise<boolean> {
    throw new Error("Countdown repository is not configured");
  },
  async findContactsByUserId(): Promise<EmergencyContactRecord[]> {
    throw new Error("Countdown repository is not configured");
  },
  async findLatestPresetMessage(): Promise<PresetMessageRecord | null> {
    throw new Error("Countdown repository is not configured");
  },
  async createDeliveryEvent(): Promise<void> {
    throw new Error("Countdown repository is not configured");
  },
  async markCountdownExpired(): Promise<void> {
    throw new Error("Countdown repository is not configured");
  },
};

const unconfiguredDelivery: DeliverySender = {
  async send(): Promise<DeliveryResult> {
    throw new Error("Delivery sender is not configured");
  },
};

export const countdownStatuses = {
  active: ACTIVE_STATUS,
  triggering: TRIGGERING_STATUS,
  expired: EXPIRED_STATUS,
  paused: PAUSED_STATUS,
} as const;
