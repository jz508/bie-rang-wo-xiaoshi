import {
  type Countdown as PrismaCountdown,
  type EmailLoginCode as PrismaEmailLoginCode,
  type EmergencyContact as PrismaEmergencyContact,
  Prisma,
  type PrismaClient,
  type User as PrismaUser,
} from "@prisma/client";
import { createHash } from "node:crypto";
import type {
  CountdownStatus,
  EmergencyContactStatus,
  MessageReviewStatus,
  MessageTemplateKey,
} from "@bie-rang-wo-xiaoshi/domain";
import {
  assertCanInvite,
  type ContactRecord,
  type ContactRepository,
  type ContactSenderRecord,
} from "../services/contactService";
import type {
  CountdownRecord,
  CountdownRepository,
  DeliveryEventInput,
  EmergencyContactRecord,
  PresetMessageRecord,
} from "../services/countdownService";
import type {
  AbuseEventInput,
  MessageReviewRepository,
  PresetMessageReviewRecord,
} from "../services/messageReviewService";
import type {
  PageDataRepository,
  ContactConfirmationLookup,
  TriggerMessageLookup,
} from "../services/pageDataService";
import type {
  EmailAuthCodeRecord,
  EmailAuthRepository,
  EmailAuthUserRecord,
} from "../services/emailAuthService";
import { getPrismaClient } from "../runtime/prisma";

type ContactRollbackSnapshot = {
  contact: ContactRecord | null;
  inviteCreatedAt: Date;
};

export class PrismaMvpRepository
  implements ContactRepository, CountdownRepository, MessageReviewRepository, PageDataRepository, EmailAuthRepository
{
  private readonly rollbackSnapshots = new Map<string, ContactRollbackSnapshot>();

  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async findLatestEmailLoginCode(email: string): Promise<EmailAuthCodeRecord | null> {
    const code = await this.prisma.emailLoginCode.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
    });

    return code ? toEmailAuthCodeRecord(code) : null;
  }

  async createEmailLoginCode(input: {
    email: string;
    codeHash: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<EmailAuthCodeRecord> {
    const code = await this.prisma.emailLoginCode.create({
      data: {
        email: input.email,
        codeHash: input.codeHash,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      },
    });

    return toEmailAuthCodeRecord(code);
  }

  async incrementEmailLoginCodeAttempt(input: { codeId: string; attemptedAt: Date }): Promise<void> {
    await this.prisma.emailLoginCode.update({
      where: { id: input.codeId },
      data: {
        attemptCount: {
          increment: 1,
        },
      },
    });
  }

  async consumeEmailLoginCode(input: { codeId: string; consumedAt: Date }): Promise<void> {
    await this.prisma.emailLoginCode.update({
      where: { id: input.codeId },
      data: {
        consumedAt: input.consumedAt,
      },
    });
  }

  async upsertVerifiedEmailUser(input: {
    email: string;
    emailVerifiedAt: Date;
    nickname: string;
  }): Promise<EmailAuthUserRecord> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            email: input.email,
            emailVerifiedAt: input.emailVerifiedAt,
          },
        })
      : await this.prisma.user.create({
          data: {
            email: input.email,
            emailVerifiedAt: input.emailVerifiedAt,
            nickname: input.nickname,
            phone: buildEmailLoginPlaceholderPhone(input.email),
            phoneVerifiedAt: input.emailVerifiedAt,
            countdown: {
              create: {
                durationMinutes: 135,
                lastConfirmedAt: input.emailVerifiedAt,
                expiresAt: new Date(input.emailVerifiedAt.getTime() + 135 * 60_000),
                status: "active",
              },
            },
          },
        });

    return toEmailAuthUserRecord(user);
  }

  async findSenderById(userId: string): Promise<ContactSenderRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        phone: true,
        phoneVerifiedAt: true,
      },
    });

    return user ? toContactSenderRecord(user) : null;
  }

  async upsertPendingContactInviteAtomically(input: {
    userId: string;
    phone: string;
    email?: string | null;
    displayName: string;
    now: Date;
    cooldownMs: number;
  }): Promise<ContactRecord> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.emergencyContact.findUnique({
        where: {
          userId_phone: {
            userId: input.userId,
            phone: input.phone,
          },
        },
      });
      assertCanInvite(existing ? toContactRecord(existing) : null, input.now, input.cooldownMs);

      const contact = existing
        ? await tx.emergencyContact.update({
            where: { id: existing.id },
            data: {
              displayName: input.displayName,
              email: input.email ?? null,
              status: "pending",
              lastInviteAt: input.now,
            },
          })
        : await tx.emergencyContact.create({
            data: {
              userId: input.userId,
              phone: input.phone,
              email: input.email ?? null,
              displayName: input.displayName,
              status: "pending",
              lastInviteAt: input.now,
            },
          });

      this.rollbackSnapshots.set(rollbackKey(contact.id, input.now), {
        contact: existing ? toContactRecord(existing) : null,
        inviteCreatedAt: input.now,
      });

      return toContactRecord(contact);
    });
  }

  async deleteUnsentPendingContactInvite(input: {
    userId: string;
    contactId: string;
    inviteCreatedAt: Date;
  }): Promise<void> {
    const key = rollbackKey(input.contactId, input.inviteCreatedAt);
    const snapshot = this.rollbackSnapshots.get(key);
    this.rollbackSnapshots.delete(key);

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.emergencyContact.findFirst({
        where: {
          id: input.contactId,
          userId: input.userId,
          status: "pending",
          lastInviteAt: input.inviteCreatedAt,
        },
      });

      if (!current) {
        return;
      }

      if (snapshot?.contact) {
        await tx.emergencyContact.update({
          where: { id: input.contactId },
          data: {
            displayName: snapshot.contact.displayName,
            email: snapshot.contact.email,
            status: snapshot.contact.status,
            lastInviteAt: snapshot.contact.lastInviteAt,
            blockedAt: snapshot.contact.blockedAt,
          },
        });
        return;
      }

      await tx.emergencyContact.delete({
        where: { id: input.contactId },
      });
    });
  }

  async updatePendingContactResponse(input: {
    userId: string;
    contactId: string;
    status: ContactRecord["status"];
    now: Date;
    blockedAt?: Date;
    allowReportedReplay?: boolean;
  }): Promise<ContactRecord> {
    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.emergencyContact.findUnique({
        where: { id: input.contactId },
      });
      if (!contact || contact.userId !== input.userId) {
        throw new Error("Contact not found");
      }
      if (contact.status !== "pending") {
        if (input.allowReportedReplay && input.status === "reported" && contact.status === "reported") {
          return toContactRecord(contact);
        }
        throw new Error("Contact invite is no longer pending");
      }

      const updated = await tx.emergencyContact.update({
        where: { id: input.contactId },
        data: {
          status: input.status,
          blockedAt: input.blockedAt ?? contact.blockedAt,
        },
      });

      return toContactRecord(updated);
    });
  }

  async findCountdownByUserId(userId: string): Promise<CountdownRecord | null> {
    const countdown = await this.prisma.countdown.findUnique({
      where: { userId },
    });

    return countdown ? toCountdownRecord(countdown) : null;
  }

  async ensureVerifiedUserWithCountdown(input: {
    durationMinutes?: number;
    nickname?: string;
    phone?: string;
    userId: string;
    now: Date;
  }): Promise<void> {
    const durationMinutes = input.durationMinutes ?? 135;
    await this.prisma.user.upsert({
      where: { id: input.userId },
      update: {},
      create: {
        id: input.userId,
        phone: input.phone ?? `dev-${input.userId}`,
        phoneVerifiedAt: input.now,
        nickname: input.nickname ?? "小林",
        countdown: {
          create: {
            durationMinutes,
            lastConfirmedAt: input.now,
            expiresAt: new Date(input.now.getTime() + durationMinutes * 60_000),
            status: "active",
          },
        },
      },
    });
  }

  async createCountdown(input: {
    userId: string;
    durationMinutes: number;
    lastConfirmedAt: Date;
    expiresAt: Date;
    status: CountdownStatus;
  }): Promise<CountdownRecord> {
    const countdown = await this.prisma.countdown.create({
      data: {
        userId: input.userId,
        durationMinutes: input.durationMinutes,
        lastConfirmedAt: input.lastConfirmedAt,
        expiresAt: input.expiresAt,
        status: input.status,
      },
    });

    return toCountdownRecord(countdown);
  }

  async updateCountdownConfirmation(input: {
    userId: string;
    durationMinutes?: number;
    lastConfirmedAt: Date;
    expiresAt: Date;
    status: CountdownStatus;
  }): Promise<CountdownRecord> {
    const countdown = await this.prisma.countdown.update({
      where: { userId: input.userId },
      data: {
        lastConfirmedAt: input.lastConfirmedAt,
        expiresAt: input.expiresAt,
        ...(input.durationMinutes ? { durationMinutes: input.durationMinutes } : {}),
        status: input.status,
        triggerClaimedAt: null,
      },
    });

    return toCountdownRecord(countdown);
  }

  async pauseCountdown(input: {
    userId: string;
    pausedAt: Date;
  }): Promise<CountdownRecord> {
    const countdown = await this.prisma.countdown.update({
      where: { userId: input.userId },
      data: {
        status: "paused",
        triggerClaimedAt: null,
      },
    });

    return toCountdownRecord(countdown);
  }

  async claimExpiredCountdowns(input: {
    now: Date;
    staleClaimedBefore: Date;
  }): Promise<CountdownRecord[]> {
    const claimed = await this.prisma.$queryRaw<PrismaCountdown[]>(Prisma.sql`
      UPDATE "Countdown"
      SET "status" = 'triggering', "triggerClaimedAt" = ${input.now}
      WHERE "id" IN (
        SELECT "id"
        FROM "Countdown"
        WHERE
          ("status" = 'active' AND "expiresAt" <= ${input.now})
          OR (
            "status" = 'triggering'
            AND "triggerClaimedAt" IS NOT NULL
            AND "triggerClaimedAt" <= ${input.staleClaimedBefore}
          )
        ORDER BY "expiresAt" ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "userId", "durationMinutes", "lastConfirmedAt", "expiresAt", "status", "triggerClaimedAt"
    `);

    return claimed.map(toCountdownRecord);
  }

  async isSmsTriggerPaused(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { smsTriggerPausedAt: true },
    });

    return Boolean(user?.smsTriggerPausedAt);
  }

  async findContactsByUserId(userId: string): Promise<EmergencyContactRecord[]> {
    const contacts = await this.prisma.emergencyContact.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    return contacts.map(toEmergencyContactRecord);
  }

  async findLatestPresetMessage(userId: string): Promise<PresetMessageRecord | null> {
    const message = await this.prisma.presetMessage.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    return message ? toPresetMessageRecord(message) : null;
  }

  async createDeliveryEvent(event: DeliveryEventInput): Promise<void> {
    try {
      await this.prisma.deliveryEvent.create({
        data: {
          userId: event.userId,
          countdownId: event.countdownId,
          contactId: event.contactId,
          channel: event.channel,
          status: event.status,
          reason: event.reason,
          triggerKey: event.triggerKey,
          idempotencyKey: event.idempotencyKey,
          templateKey: event.templateKey,
          templateText: event.templateText,
          shortNote: event.shortNote,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  async markCountdownExpired(countdownId: string): Promise<void> {
    await this.prisma.countdown.updateMany({
      where: {
        id: countdownId,
        status: "triggering",
      },
      data: {
        status: "expired",
        triggerClaimedAt: null,
      },
    });
  }

  async savePresetMessageReview(input: {
    userId: string;
    templateKey: MessageTemplateKey;
    shortNote: string;
    reviewStatus: MessageReviewStatus;
    reviewReason: string | null;
    now: Date;
  }): Promise<PresetMessageReviewRecord> {
    const message = await this.prisma.presetMessage.create({
      data: {
        userId: input.userId,
        templateKey: input.templateKey,
        shortNote: input.shortNote,
        reviewStatus: input.reviewStatus,
        reviewReason: input.reviewReason,
        updatedAt: input.now,
      },
    });

    return toPresetMessageReviewRecord(message);
  }

  async recordContactReportOnceAndSuppressContact(input: AbuseEventInput): Promise<{
    reportRecorded: boolean;
    reportsForUser: number;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.emergencyContact.findFirst({
        where: {
          id: input.contactId,
          userId: input.userId,
        },
      });
      if (!contact) {
        throw new Error("Contact not found");
      }

      const existing = await tx.abuseEvent.findUnique({
        where: {
          userId_contactId_type: {
            userId: input.userId,
            contactId: input.contactId,
            type: input.type,
          },
        },
      });
      if (!existing) {
        await tx.abuseEvent.create({
          data: {
            userId: input.userId,
            contactId: input.contactId,
            type: input.type,
            reason: input.reason,
            createdAt: input.createdAt,
          },
        });
      }

      await tx.emergencyContact.update({
        where: { id: input.contactId },
        data: { status: "reported" },
      });
      const reportsForUser = await tx.abuseEvent.count({
        where: {
          userId: input.userId,
          type: "contact_report",
        },
      });

      return {
        reportRecorded: !existing,
        reportsForUser,
      };
    });
  }

  async pauseSmsTriggerForUser(input: { userId: string; pausedAt: Date; reason: string }): Promise<void> {
    await this.prisma.user.update({
      where: { id: input.userId },
      data: {
        smsTriggerPausedAt: input.pausedAt,
        smsTriggerPausedReason: input.reason,
      },
    });
  }

  async findContactConfirmation(input: {
    contactId: string;
    userId: string;
  }): Promise<ContactConfirmationLookup | null> {
    const contact = await this.prisma.emergencyContact.findFirst({
      where: {
        id: input.contactId,
        userId: input.userId,
      },
      include: {
        user: true,
      },
    });

    if (!contact) {
      return null;
    }

    return {
      contactDisplayName: contact.displayName,
      contactStatus: toEmergencyContactStatus(contact.status),
      inviterNickname: contact.user.nickname,
    };
  }

  async findTriggerMessage(input: {
    contactId: string;
    idempotencyKey: string;
    userId: string;
  }): Promise<TriggerMessageLookup | null> {
    const event = await this.prisma.deliveryEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: {
        contact: true,
        user: true,
      },
    });

    if (!event || event.userId !== input.userId || event.contactId !== input.contactId) {
      return null;
    }

    return {
      contactDisplayName: event.contact.displayName,
      contactStatus: toEmergencyContactStatus(event.contact.status),
      shortNote: event.shortNote,
      templateText: event.templateText,
      userNickname: event.user.nickname,
    };
  }
}

export function createPrismaMvpRepository(prisma: PrismaClient = getPrismaClient()): PrismaMvpRepository {
  return new PrismaMvpRepository(prisma);
}

function rollbackKey(contactId: string, inviteCreatedAt: Date): string {
  return `${contactId}:${inviteCreatedAt.toISOString()}`;
}

function toEmailAuthCodeRecord(code: PrismaEmailLoginCode): EmailAuthCodeRecord {
  return {
    id: code.id,
    email: code.email,
    codeHash: code.codeHash,
    attemptCount: code.attemptCount,
    consumedAt: code.consumedAt,
    createdAt: code.createdAt,
    expiresAt: code.expiresAt,
  };
}

function toEmailAuthUserRecord(user: {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  nickname: string;
}): EmailAuthUserRecord {
  if (!user.email || !user.emailVerifiedAt) {
    throw new Error("Email user is not verified");
  }

  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    nickname: user.nickname,
  };
}

function buildEmailLoginPlaceholderPhone(email: string): string {
  const digest = createHash("sha256").update(email).digest("hex").slice(0, 32);

  return `email-login:${digest}`;
}

function toContactSenderRecord(user: Pick<PrismaUser, "id" | "nickname" | "phone" | "phoneVerifiedAt">): ContactSenderRecord {
  return {
    id: user.id,
    nickname: user.nickname,
    phone: user.phone,
    phoneVerifiedAt: user.phoneVerifiedAt,
  };
}

function toContactRecord(contact: PrismaEmergencyContact): ContactRecord {
  return {
    id: contact.id,
    userId: contact.userId,
    phone: contact.phone,
    email: contact.email,
    displayName: contact.displayName,
    status: toEmergencyContactStatus(contact.status),
    lastInviteAt: contact.lastInviteAt,
    blockedAt: contact.blockedAt,
  };
}

function toEmergencyContactRecord(contact: PrismaEmergencyContact): EmergencyContactRecord {
  return {
    id: contact.id,
    userId: contact.userId,
    phone: contact.phone,
    email: contact.email,
    displayName: contact.displayName,
    status: toEmergencyContactStatus(contact.status),
  };
}

function toCountdownRecord(countdown: PrismaCountdown): CountdownRecord {
  return {
    id: countdown.id,
    userId: countdown.userId,
    durationMinutes: countdown.durationMinutes,
    lastConfirmedAt: countdown.lastConfirmedAt,
    expiresAt: countdown.expiresAt,
    status: toCountdownStatus(countdown.status),
    triggerClaimedAt: countdown.triggerClaimedAt,
  };
}

function toPresetMessageRecord(message: {
  id: string;
  userId: string;
  templateKey: string;
  shortNote: string;
  reviewStatus: string;
  reviewReason: string | null;
  updatedAt: Date;
}): PresetMessageRecord {
  return {
    id: message.id,
    userId: message.userId,
    templateKey: message.templateKey,
    shortNote: message.shortNote,
    reviewStatus: toMessageReviewStatus(message.reviewStatus),
    reviewReason: message.reviewReason,
    updatedAt: message.updatedAt,
  };
}

function toPresetMessageReviewRecord(message: {
  id: string;
  userId: string;
  templateKey: string;
  shortNote: string;
  reviewStatus: string;
  reviewReason: string | null;
  updatedAt: Date;
}): PresetMessageReviewRecord {
  return {
    ...toPresetMessageRecord(message),
    templateKey: message.templateKey as MessageTemplateKey,
  };
}

function toCountdownStatus(status: string): CountdownStatus {
  return status as CountdownStatus;
}

function toEmergencyContactStatus(status: string): EmergencyContactStatus {
  return status as EmergencyContactStatus;
}

function toMessageReviewStatus(status: string): MessageReviewStatus {
  return status as MessageReviewStatus;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
