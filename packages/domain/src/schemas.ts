import type { MessageTemplateKey } from "./messageTemplates.js";

export const countdownStatuses = ["active", "triggering", "expired", "paused"] as const;
export type CountdownStatus = (typeof countdownStatuses)[number];

export const emergencyContactStatuses = [
  "pending",
  "confirmed",
  "declined",
  "blocked",
  "reported",
] as const;
export type EmergencyContactStatus = (typeof emergencyContactStatuses)[number];

export const messageReviewStatuses = ["approved", "rejected"] as const;
export type MessageReviewStatus = (typeof messageReviewStatuses)[number];

export const deliveryChannels = ["sms", "email"] as const;
export type DeliveryChannel = (typeof deliveryChannels)[number];

export const deliveryStatuses = ["pending", "sent", "failed", "suppressed"] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];

export const abuseEventTypes = ["contact_report"] as const;
export type AbuseEventType = (typeof abuseEventTypes)[number];

export type User = {
  id: string;
  nickname: string;
  phone?: string;
  phoneVerifiedAt?: Date | null;
  smsTriggerPausedAt?: Date | null;
  smsTriggerPausedReason?: string | null;
  createdAt: Date;
};

export type Countdown = {
  id: string;
  userId: string;
  startedAt: Date;
  durationMinutes: number;
  expiresAt: Date;
  status: CountdownStatus;
  triggerClaimedAt: Date | null;
};

export type EmergencyContact = {
  id: string;
  userId: string;
  displayName: string;
  phone: string;
  email?: string;
  status: EmergencyContactStatus;
  lastInviteAt: Date | null;
};

export type PresetMessage = {
  templateKey: MessageTemplateKey;
  shortNote: string;
  reviewStatus: MessageReviewStatus;
  reviewReason?: string;
};

export type DeliveryEvent = {
  id: string;
  userId: string;
  countdownId: string;
  contactId: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  reason?: string;
  triggerKey: string;
  idempotencyKey: string;
  templateKey: MessageTemplateKey;
  templateText: string;
  shortNote?: string;
  createdAt: Date;
};

export type AbuseEvent = {
  id: string;
  userId: string;
  contactId: string;
  type: AbuseEventType;
  reason?: string | null;
  createdAt: Date;
};
