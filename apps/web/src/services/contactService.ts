import type { EmergencyContactStatus } from "@bie-rang-wo-xiaoshi/domain";
import {
  buildContactInviteSmsPayload,
  type ContactInviteSmsPayload,
} from "./deliveryService";
import {
  handleContactReport,
  type MessageReviewRepository,
} from "./messageReviewService";
import { createSignedToken, verifySignedToken } from "./tokenService";

export type ContactSenderRecord = {
  id: string;
  nickname: string;
  phone: string;
  phoneVerifiedAt: Date | null;
};

export type ContactRecord = {
  id: string;
  userId: string;
  phone: string;
  email: string | null;
  displayName: string;
  status: EmergencyContactStatus;
  lastInviteAt: Date | null;
  blockedAt: Date | null;
};

export type ContactRepository = {
  findSenderById(userId: string): Promise<ContactSenderRecord | null>;
  upsertPendingContactInviteAtomically(input: {
    userId: string;
    phone: string;
    displayName: string;
    now: Date;
    cooldownMs: number;
  }): Promise<ContactRecord>;
  deleteUnsentPendingContactInvite(input: {
    userId: string;
    contactId: string;
    inviteCreatedAt: Date;
  }): Promise<void>;
  /**
   * Atomically applies a pending contact response. Report responses may return an
   * already-reported contact when allowReportedReplay is true so downstream
   * abuse handling can be retried without reopening terminal actions.
   */
  updatePendingContactResponse(input: {
    userId: string;
    contactId: string;
    status: ContactRecord["status"];
    now: Date;
    blockedAt?: Date;
    allowReportedReplay?: boolean;
  }): Promise<ContactRecord>;
};

export type ContactInviteDeliveryPayload = ContactInviteSmsPayload;

export type ContactInviteDeliveryGateway = {
  sendInviteSms(payload: ContactInviteDeliveryPayload): Promise<void>;
};

export type InviteContactInput = {
  userId: string;
  phone: string;
  displayName: string;
  now: Date;
  tokenSecret: string;
  confirmationBaseUrl: string;
};

export type InviteContactResult = {
  contact: ContactRecord;
  token: string;
};

export type ContactInviteAction = "agree" | "decline" | "report" | "opt_out";

export type RespondToContactInviteInput = {
  token: string;
  action: ContactInviteAction;
  now: Date;
  tokenSecret: string;
};

export type ContactServiceDeps = {
  repository?: ContactRepository;
  delivery?: ContactInviteDeliveryGateway;
  messageReviewRepository?: MessageReviewRepository;
};

const CONTACT_CONFIRMATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REINVITE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export async function inviteContact(
  input: InviteContactInput,
  deps: ContactServiceDeps = {},
): Promise<InviteContactResult> {
  const repository = deps.repository ?? unconfiguredRepository;
  const delivery = deps.delivery ?? unconfiguredDelivery;
  const sender = await repository.findSenderById(input.userId);

  if (!sender) {
    throw new Error("Sender not found");
  }

  if (!sender.phoneVerifiedAt) {
    throw new Error("Sender phone is not verified");
  }

  const contact = await repository.upsertPendingContactInviteAtomically({
    userId: input.userId,
    phone: input.phone,
    displayName: input.displayName,
    now: input.now,
    cooldownMs: REINVITE_COOLDOWN_MS,
  });
  const token = createSignedToken({
    purpose: "contact-confirmation",
    userId: input.userId,
    contactId: contact.id,
    expiresAt: new Date(input.now.getTime() + CONTACT_CONFIRMATION_TOKEN_TTL_MS),
    secret: input.tokenSecret,
  });

  try {
    await delivery.sendInviteSms(
      buildContactInviteSmsPayload({
        toPhone: input.phone,
        inviterNickname: sender.nickname,
        confirmationUrl: buildConfirmationUrl(input.confirmationBaseUrl, token),
      }),
    );
  } catch (error) {
    await repository.deleteUnsentPendingContactInvite({
      userId: input.userId,
      contactId: contact.id,
      inviteCreatedAt: input.now,
    });
    throw error;
  }

  return { contact, token };
}

export async function respondToContactInvite(
  input: RespondToContactInviteInput,
  deps: Pick<ContactServiceDeps, "repository" | "messageReviewRepository"> = {},
): Promise<ContactRecord> {
  const repository = deps.repository ?? unconfiguredRepository;
  const token = verifySignedToken(input.token, {
    purpose: "contact-confirmation",
    secret: input.tokenSecret,
    now: input.now,
  });
  const status = getStatusForAction(input.action);

  const contact = await repository.updatePendingContactResponse({
    userId: token.userId,
    contactId: token.contactId,
    status,
    now: input.now,
    blockedAt: input.action === "opt_out" ? input.now : undefined,
    allowReportedReplay: input.action === "report",
  });

  if (input.action === "report") {
    await handleContactReport(
      {
        userId: token.userId,
        contactId: token.contactId,
        now: input.now,
      },
      { repository: deps.messageReviewRepository },
    );
  }

  return contact;
}

export function assertCanInvite(existing: ContactRecord | null, now: Date, cooldownMs = REINVITE_COOLDOWN_MS): void {
  if (!existing) {
    return;
  }

  if (existing.status === "declined" || existing.status === "blocked" || existing.status === "reported") {
    throw new Error("Contact has blocked future invites");
  }

  if (
    existing.status === "pending" &&
    existing.lastInviteAt &&
    now.getTime() - existing.lastInviteAt.getTime() < cooldownMs
  ) {
    throw new Error("Contact already has a pending invite within 30 days");
  }
}

function getStatusForAction(action: ContactInviteAction): ContactRecord["status"] {
  switch (action) {
    case "agree":
      return "confirmed";
    case "decline":
      return "declined";
    case "report":
      return "reported";
    case "opt_out":
      return "blocked";
  }
}

function buildConfirmationUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${token}`;
}

const unconfiguredRepository: ContactRepository = {
  async findSenderById(): Promise<ContactSenderRecord | null> {
    throw new Error("Contact repository is not configured");
  },
  async upsertPendingContactInviteAtomically(): Promise<ContactRecord> {
    throw new Error("Contact repository is not configured");
  },
  async deleteUnsentPendingContactInvite(): Promise<void> {
    throw new Error("Contact repository is not configured");
  },
  async updatePendingContactResponse(): Promise<ContactRecord> {
    throw new Error("Contact repository is not configured");
  },
};

const unconfiguredDelivery: ContactInviteDeliveryGateway = {
  async sendInviteSms(): Promise<void> {
    throw new Error("Contact invite delivery is not configured");
  },
};
