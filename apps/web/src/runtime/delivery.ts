import type {
  ContactInviteDeliveryGateway,
} from "../services/contactService";
import {
  createRuntimeEmailProvider,
  type EmailMessage,
  type EmailProvider,
} from "../adapters/emailProvider";
import type {
  DeliveryPayload,
  DeliveryResult,
  DeliverySender,
} from "../services/countdownService";
import {
  buildTriggerAlertSmsPayload,
  type SmsProvider,
} from "../services/deliveryService";

export function createContactInviteDelivery(
  provider: SmsProvider = createRuntimeSmsProvider(),
  emailProvider: EmailProvider = createRuntimeEmailProvider(),
): ContactInviteDeliveryGateway {
  return {
    async sendInviteEmail(payload): Promise<void> {
      await emailProvider.sendEmail(payload);
    },

    async sendInviteSms(payload): Promise<void> {
      await provider.sendTemplateSms(payload);
    },
  };
}

export function createTriggerDeliverySender(
  provider: SmsProvider = createRuntimeSmsProvider(),
  emailProvider: EmailProvider = createRuntimeEmailProvider(),
): DeliverySender {
  return {
    async send(payload: DeliveryPayload): Promise<DeliveryResult> {
      if (payload.channel === "email") {
        if (!payload.contact.email) {
          return { status: "failed", reason: "Contact email is missing" };
        }

        await emailProvider.sendEmail(buildTriggerAlertEmailMessage(payload));
        return { status: "sent" };
      }

      if (!payload.contact.phone) {
        return { status: "failed", reason: "Contact phone is missing" };
      }

      await provider.sendTemplateSms(
        buildTriggerAlertSmsPayload({
          toPhone: payload.contact.phone,
          messageUrl: payload.messageUrl,
        }),
      );

      return { status: "sent" };
    },
  };
}

function buildTriggerAlertEmailMessage(payload: DeliveryPayload): EmailMessage {
  return {
    toEmail: payload.contact.email ?? "",
    subject: "别让我消失安全提醒",
    text: [
      `${payload.contact.displayName}，你被设置为紧急联系人。`,
      "如果对方没有及时确认安全，请打开下面的链接查看预留信息：",
      payload.messageUrl,
    ].join("\n"),
    idempotencyKey: payload.idempotencyKey,
  };
}

export function createRuntimeSmsProvider(): SmsProvider {
  const webhookUrl = process.env.SMS_PROVIDER_WEBHOOK_URL;
  if (!webhookUrl) {
    return createLocalOutboxSmsProvider();
  }

  return {
    async sendTemplateSms(payload): Promise<void> {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.SMS_PROVIDER_API_KEY
            ? { authorization: `Bearer ${process.env.SMS_PROVIDER_API_KEY}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`SMS provider failed with ${response.status}`);
      }
    },
  };
}

function createLocalOutboxSmsProvider(): SmsProvider {
  return {
    async sendTemplateSms(payload): Promise<void> {
      if (process.env.NODE_ENV === "production") {
        throw new Error("SMS provider is not configured");
      }

      console.info("[local-sms-outbox]", JSON.stringify(payload));
    },
  };
}
