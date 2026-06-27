import { describe, expect, it, vi } from "vitest";
import type { EmailMessage, EmailProvider } from "../adapters/emailProvider";
import {
  createResendEmailProvider,
  createRuntimeEmailProvider,
} from "../adapters/emailProvider";
import type { DeliveryPayload } from "../services/countdownService";
import type { SmsProvider } from "../services/deliveryService";
import { createTriggerDeliverySender } from "../runtime/delivery";

class FakeEmailProvider implements EmailProvider {
  messages: EmailMessage[] = [];

  async sendEmail(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

class FakeSmsProvider implements SmsProvider {
  payloads: Parameters<SmsProvider["sendTemplateSms"]>[0][] = [];

  async sendTemplateSms(payload: Parameters<SmsProvider["sendTemplateSms"]>[0]): Promise<void> {
    this.payloads.push(payload);
  }
}

describe("runtime delivery", () => {
  it("sends trigger email through Resend with the configured sender", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    const provider = createResendEmailProvider({
      apiKey: "resend-secret",
      fromEmail: "alerts@example.com",
      fetchImpl,
    });

    await provider.sendEmail({
      toEmail: "chenmo@example.com",
      subject: "别让我消失提醒",
      text: "请查看 https://app.test/m/token",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer resend-secret",
          "content-type": "application/json",
          "user-agent": "bie-rang-wo-xiaoshi-web",
        }),
        body: JSON.stringify({
          from: "alerts@example.com",
          to: ["chenmo@example.com"],
          subject: "别让我消失提醒",
          text: "请查看 https://app.test/m/token",
        }),
      }),
    );
  });

  it("fails closed in production when no email provider is configured", async () => {
    const provider = createRuntimeEmailProvider({
      NODE_ENV: "production",
    });

    await expect(
      provider.sendEmail({
        toEmail: "chenmo@example.com",
        subject: "别让我消失提醒",
        text: "请查看 https://app.test/m/token",
      }),
    ).rejects.toThrow("Email provider is not configured");
  });

  it("sends trigger deliveries through email when the payload channel is email", async () => {
    const smsProvider = new FakeSmsProvider();
    const emailProvider = new FakeEmailProvider();
    const sender = createTriggerDeliverySender(smsProvider, emailProvider);

    const result = await sender.send(triggerPayload("email"));

    expect(result).toEqual({ status: "sent" });
    expect(smsProvider.payloads).toHaveLength(0);
    expect(emailProvider.messages).toEqual([
      {
        toEmail: "chenmo@example.com",
        subject: "别让我消失安全提醒",
        idempotencyKey: "countdown-1:2026-06-24T11:00:00.000Z:contact-1:email",
        text: [
          "陈默，你被设置为紧急联系人。",
          "如果对方没有及时确认安全，请打开下面的链接查看预留信息：",
          "https://app.test/m/token",
        ].join("\n"),
      },
    ]);
  });

  it("records a failed email delivery when the selected channel lacks an email address", async () => {
    const sender = createTriggerDeliverySender(new FakeSmsProvider(), new FakeEmailProvider());
    const payload = triggerPayload("email");
    payload.contact.email = null;

    await expect(sender.send(payload)).resolves.toEqual({
      status: "failed",
      reason: "Contact email is missing",
    });
  });
});

function triggerPayload(channel: "email" | "sms"): DeliveryPayload {
  return {
    userId: "user-1",
    channel,
    contact: {
      id: "contact-1",
      userId: "user-1",
      phone: "13900139000",
      email: "chenmo@example.com",
      displayName: "陈默",
      status: "confirmed",
    },
    templateKey: "contact_or_find_me",
    templateText: "请联系我，或者来找我。",
    messageUrl: "https://app.test/m/token",
    triggerKey: "countdown-1:2026-06-24T11:00:00.000Z",
    idempotencyKey: "countdown-1:2026-06-24T11:00:00.000Z:contact-1:email",
  };
}
