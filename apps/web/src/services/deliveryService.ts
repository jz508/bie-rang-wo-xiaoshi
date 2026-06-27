export const CONTACT_INVITE_SMS_TEMPLATE_ID = "contact-confirmation-v1";
export const TRIGGER_ALERT_SMS_TEMPLATE_ID = "trigger-alert-v1";

export type ContactInviteSmsPayload = {
  toPhone: string;
  templateId: typeof CONTACT_INVITE_SMS_TEMPLATE_ID;
  templateVariables: {
    inviterNickname: string;
    confirmationUrl: string;
  };
};

export type TriggerAlertSmsPayload = {
  toPhone: string;
  templateId: typeof TRIGGER_ALERT_SMS_TEMPLATE_ID;
  templateVariables: {
    messageUrl: string;
  };
};

export type ContactInviteSmsInput = {
  toPhone: string;
  inviterNickname: string;
  confirmationUrl: string;
};

export type TriggerAlertSmsInput = {
  toPhone: string;
  messageUrl: string;
};

export type SmsProvider = {
  sendTemplateSms(payload: ContactInviteSmsPayload | TriggerAlertSmsPayload): Promise<void>;
};

export function buildContactInviteSmsPayload(input: ContactInviteSmsInput): ContactInviteSmsPayload {
  return {
    toPhone: input.toPhone,
    templateId: CONTACT_INVITE_SMS_TEMPLATE_ID,
    templateVariables: {
      inviterNickname: input.inviterNickname,
      confirmationUrl: input.confirmationUrl,
    },
  };
}

export function buildTriggerAlertSmsPayload(input: TriggerAlertSmsInput): TriggerAlertSmsPayload {
  return {
    toPhone: input.toPhone,
    templateId: TRIGGER_ALERT_SMS_TEMPLATE_ID,
    templateVariables: {
      messageUrl: input.messageUrl,
    },
  };
}

export async function sendContactInviteSms(
  provider: SmsProvider,
  input: ContactInviteSmsInput,
): Promise<void> {
  await provider.sendTemplateSms(buildContactInviteSmsPayload(input));
}
