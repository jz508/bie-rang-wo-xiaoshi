import { messageTemplates, type MessageTemplateKey } from "./messageTemplates.js";
import { reviewShortNote } from "./moderation.js";

const MINUTE_MS = 60_000;
export const MAX_MISSING_PERSON_CONTACTS = 3;

export type MissingPersonPlanStatus =
  | "active"
  | "paused"
  | "inactive"
  | "disabled"
  | "archived"
  | "triggering"
  | "expired";

export type EvaluateMissingPersonPlanTriggerInput = {
  now: Date;
  lastConfirmedAt: Date;
  timeoutMinutes: number;
  planStatus: MissingPersonPlanStatus;
  lastTriggeredAt?: Date | null;
  triggeredAt?: Date | null;
};

export type MissingPersonPlanTriggerDecision = {
  expired: boolean;
  shouldTrigger: boolean;
  deadlineAt: Date;
  minutesOverdue: number;
};

export type MissingPersonContact = {
  id: string;
  enabled: boolean;
};

export type BuildMissingPersonNotificationBatchInput = {
  contacts: MissingPersonContact[];
  templateId: MessageTemplateKey | string;
  shortNote?: string;
};

export type MissingPersonNotificationDraft = {
  contactId: string;
  templateId: MessageTemplateKey;
  templateText: string;
  shortNote?: string;
};

export type MissingPersonNotificationBatch = {
  notifications: MissingPersonNotificationDraft[];
};

function assertValidDate(value: Date, name: string): void {
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`Missing person ${name} must be a valid Date`);
  }
}

function getMostRecentTriggerAt(
  lastTriggeredAt?: Date | null,
  triggeredAt?: Date | null,
): Date | null {
  if (lastTriggeredAt !== undefined && lastTriggeredAt !== null) {
    assertValidDate(lastTriggeredAt, "lastTriggeredAt");
  }

  if (triggeredAt !== undefined && triggeredAt !== null) {
    assertValidDate(triggeredAt, "triggeredAt");
  }

  if (lastTriggeredAt && triggeredAt) {
    return lastTriggeredAt.getTime() >= triggeredAt.getTime() ? lastTriggeredAt : triggeredAt;
  }

  return lastTriggeredAt ?? triggeredAt ?? null;
}

export function evaluateMissingPersonPlanTrigger(
  input: EvaluateMissingPersonPlanTriggerInput,
): MissingPersonPlanTriggerDecision {
  const { now, lastConfirmedAt, timeoutMinutes, planStatus, lastTriggeredAt, triggeredAt } = input;

  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1) {
    throw new Error("Missing person timeout must be at least 1 minute");
  }

  assertValidDate(now, "now");
  assertValidDate(lastConfirmedAt, "lastConfirmedAt");

  const deadlineAt = new Date(lastConfirmedAt.getTime() + timeoutMinutes * MINUTE_MS);
  const expired = now.getTime() >= deadlineAt.getTime();
  const minutesOverdue = expired
    ? Math.floor((now.getTime() - deadlineAt.getTime()) / MINUTE_MS)
    : 0;
  const mostRecentTriggerAt = getMostRecentTriggerAt(lastTriggeredAt, triggeredAt);
  const alreadyTriggeredForConfirmation =
    mostRecentTriggerAt !== null && mostRecentTriggerAt.getTime() >= lastConfirmedAt.getTime();

  return {
    expired,
    shouldTrigger: planStatus === "active" && expired && !alreadyTriggeredForConfirmation,
    deadlineAt,
    minutesOverdue,
  };
}

function getTemplateById(templateId: string) {
  return messageTemplates.find((template) => template.key === templateId);
}

export function buildMissingPersonNotificationBatch(
  input: BuildMissingPersonNotificationBatchInput,
): MissingPersonNotificationBatch {
  const { contacts, templateId, shortNote = "" } = input;

  if (contacts.length > MAX_MISSING_PERSON_CONTACTS) {
    throw new Error("Missing person plan supports at most 3 contacts");
  }

  const template = getTemplateById(templateId);
  if (template === undefined) {
    throw new Error("Unknown missing person message template id");
  }

  const noteReview = reviewShortNote(shortNote);
  if (noteReview.status === "rejected") {
    throw new Error(noteReview.reason);
  }

  const enabledContacts = contacts.filter((contact) => contact.enabled);
  const normalizedNote =
    noteReview.normalizedNote.length > 0 ? noteReview.normalizedNote : undefined;

  return {
    notifications: enabledContacts.slice(0, MAX_MISSING_PERSON_CONTACTS).map((contact) => ({
      contactId: contact.id,
      templateId: template.key,
      templateText: template.text,
      ...(normalizedNote === undefined ? {} : { shortNote: normalizedNote }),
    })),
  };
}
