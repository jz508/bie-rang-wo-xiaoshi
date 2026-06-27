import type { EmergencyContactStatus } from "@bie-rang-wo-xiaoshi/domain";
import { verifySignedToken } from "./tokenService";

export type ContactConfirmationLookup = {
  contactDisplayName: string;
  contactStatus: EmergencyContactStatus;
  inviterNickname: string;
};

export type TriggerMessageLookup = {
  contactDisplayName: string;
  contactStatus: EmergencyContactStatus;
  shortNote: string | null;
  templateText: string;
  userNickname: string;
};

export type PageDataRepository = {
  findContactConfirmation(input: {
    contactId: string;
    userId: string;
  }): Promise<ContactConfirmationLookup | null>;
  findTriggerMessage(input: {
    contactId: string;
    idempotencyKey: string;
    userId: string;
  }): Promise<TriggerMessageLookup | null>;
};

export type ContactConfirmationPageData =
  | {
      kind: "ready";
      contactDisplayName: string;
      contactStatus: EmergencyContactStatus;
      inviterNickname: string;
      token: string;
    }
  | {
      kind: "invalid";
    };

export type TriggerMessagePageData =
  | {
      kind: "ready";
      contactDisplayName: string;
      shortNote?: string;
      templateText: string;
      userNickname: string;
    }
  | {
      kind: "invalid";
    };

export async function getContactConfirmationPageData(input: {
  now: Date;
  repository: PageDataRepository;
  secret: string;
  token: string;
}): Promise<ContactConfirmationPageData> {
  try {
    const payload = verifySignedToken(input.token, {
      purpose: "contact-confirmation",
      secret: input.secret,
      now: input.now,
    });
    const lookup = await input.repository.findContactConfirmation({
      contactId: payload.contactId,
      userId: payload.userId,
    });

    if (!lookup) {
      return { kind: "invalid" };
    }

    return {
      kind: "ready",
      contactDisplayName: lookup.contactDisplayName,
      contactStatus: lookup.contactStatus,
      inviterNickname: lookup.inviterNickname,
      token: input.token,
    };
  } catch {
    return { kind: "invalid" };
  }
}

export async function getTriggerMessagePageData(input: {
  now: Date;
  repository: PageDataRepository;
  secret: string;
  token: string;
}): Promise<TriggerMessagePageData> {
  try {
    const payload = verifySignedToken(input.token, {
      purpose: "trigger-message",
      secret: input.secret,
      now: input.now,
    });

    if (!payload.idempotencyKey) {
      return { kind: "invalid" };
    }

    const lookup = await input.repository.findTriggerMessage({
      contactId: payload.contactId,
      idempotencyKey: payload.idempotencyKey,
      userId: payload.userId,
    });

    if (!lookup || lookup.contactStatus !== "confirmed") {
      return { kind: "invalid" };
    }

    return {
      kind: "ready",
      contactDisplayName: lookup.contactDisplayName,
      shortNote: lookup.shortNote || undefined,
      templateText: lookup.templateText,
      userNickname: lookup.userNickname,
    };
  } catch {
    return { kind: "invalid" };
  }
}
