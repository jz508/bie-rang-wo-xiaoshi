import {
  type MessageReviewStatus,
  type MessageTemplate,
  type MessageTemplateKey,
  messageTemplates,
  reviewShortNote,
} from "@bie-rang-wo-xiaoshi/domain";

export const MESSAGE_REPORT_SMS_PAUSE_THRESHOLD = 3;

const DEFAULT_TEMPLATE = messageTemplates[0];
const CONTACT_REPORT_REASON = "contact_reported_trigger_message";
const SMS_PAUSE_REASON = "contact_report_threshold_reached";

export type PresetMessageReviewRecord = {
  id: string;
  userId: string;
  templateKey: MessageTemplateKey;
  shortNote: string;
  reviewStatus: MessageReviewStatus;
  reviewReason: string | null;
  updatedAt: Date;
};

export type TriggerPresetMessageRecord = Omit<PresetMessageReviewRecord, "templateKey"> & {
  templateKey: string;
};

export type AbuseEventInput = {
  userId: string;
  contactId: string;
  type: "contact_report";
  reason: string;
  createdAt: Date;
};

export type MessageReviewRepository = {
  savePresetMessageReview(input: {
    userId: string;
    templateKey: MessageTemplateKey;
    shortNote: string;
    reviewStatus: MessageReviewStatus;
    reviewReason: string | null;
    now: Date;
  }): Promise<PresetMessageReviewRecord>;
  recordContactReportOnceAndSuppressContact(input: AbuseEventInput): Promise<{
    reportRecorded: boolean;
    reportsForUser: number;
  }>;
  pauseSmsTriggerForUser(input: { userId: string; pausedAt: Date; reason: string }): Promise<void>;
};

export type ReviewAndSavePresetMessageInput = {
  userId: string;
  templateKey: string;
  shortNote?: string;
  now: Date;
};

export type TriggerMessagePayload = {
  templateKey: MessageTemplateKey;
  templateText: string;
  shortNote?: string;
};

export type HandleContactReportInput = {
  userId: string;
  contactId: string;
  now: Date;
};

export type HandleContactReportResult = {
  reportsForUser: number;
  smsTriggerPaused: boolean;
};

export type MessageReviewServiceDeps = {
  repository?: MessageReviewRepository;
};

export async function reviewAndSavePresetMessage(
  input: ReviewAndSavePresetMessageInput,
  deps: MessageReviewServiceDeps = {},
): Promise<PresetMessageReviewRecord> {
  const repository = deps.repository ?? unconfiguredRepository;
  const templateKey = parseTemplateKey(input.templateKey);
  const shortNote = (input.shortNote ?? "").trim();
  const review = reviewShortNote(shortNote);

  return repository.savePresetMessageReview({
    userId: input.userId,
    templateKey,
    shortNote,
    reviewStatus: review.status,
    reviewReason: review.status === "rejected" ? review.reason : null,
    now: input.now,
  });
}

export function buildTriggerMessagePayload(
  message: TriggerPresetMessageRecord | null,
): TriggerMessagePayload {
  const template = findTemplate(message?.templateKey);

  if (!message) {
    return templatePayload(template);
  }

  const review = reviewShortNote(message.shortNote);
  if (review.status === "rejected") {
    return templatePayload(template);
  }

  return {
    ...templatePayload(template),
    shortNote: review.normalizedNote,
  };
}

export async function handleContactReport(
  input: HandleContactReportInput,
  deps: MessageReviewServiceDeps = {},
): Promise<HandleContactReportResult> {
  const repository = deps.repository ?? unconfiguredRepository;

  const { reportsForUser } = await repository.recordContactReportOnceAndSuppressContact({
    userId: input.userId,
    contactId: input.contactId,
    type: "contact_report",
    reason: CONTACT_REPORT_REASON,
    createdAt: input.now,
  });

  const smsTriggerPaused = reportsForUser >= MESSAGE_REPORT_SMS_PAUSE_THRESHOLD;
  if (smsTriggerPaused) {
    await repository.pauseSmsTriggerForUser({
      userId: input.userId,
      pausedAt: input.now,
      reason: SMS_PAUSE_REASON,
    });
  }

  return { reportsForUser, smsTriggerPaused };
}

function parseTemplateKey(templateKey: string): MessageTemplateKey {
  if (isMessageTemplateKey(templateKey)) {
    return templateKey;
  }

  throw new Error("Invalid message template key");
}

function isMessageTemplateKey(templateKey: string): templateKey is MessageTemplateKey {
  return messageTemplates.some((template) => template.key === templateKey);
}

function findTemplate(templateKey: string | undefined): MessageTemplate {
  return messageTemplates.find((template) => template.key === templateKey) ?? DEFAULT_TEMPLATE;
}

function templatePayload(template: MessageTemplate): TriggerMessagePayload {
  return {
    templateKey: template.key,
    templateText: template.text,
  };
}

const unconfiguredRepository: MessageReviewRepository = {
  async savePresetMessageReview(): Promise<PresetMessageReviewRecord> {
    throw new Error("Message review repository is not configured");
  },
  async recordContactReportOnceAndSuppressContact(): Promise<{
    reportRecorded: boolean;
    reportsForUser: number;
  }> {
    throw new Error("Message review repository is not configured");
  },
  async pauseSmsTriggerForUser(): Promise<void> {
    throw new Error("Message review repository is not configured");
  },
};
