export type EmailMessage = {
  toEmail: string;
  subject: string;
  text: string;
  idempotencyKey?: string;
};

export type EmailProvider = {
  sendEmail(message: EmailMessage): Promise<void>;
};

type FetchLike = typeof fetch;

const RESEND_SEND_EMAIL_URL = "https://api.resend.com/emails";
const USER_AGENT = "bie-rang-wo-xiaoshi-web";

export function createRuntimeEmailProvider(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch,
): EmailProvider {
  const resendApiKey = env.RESEND_API_KEY;
  const fromEmail = env.EMAIL_FROM;
  if (resendApiKey && fromEmail) {
    return createResendEmailProvider({
      apiKey: resendApiKey,
      fromEmail,
      fetchImpl,
    });
  }

  const webhookUrl = env.EMAIL_PROVIDER_WEBHOOK_URL;
  if (webhookUrl) {
    return createWebhookEmailProvider({
      apiKey: env.EMAIL_PROVIDER_API_KEY,
      fetchImpl,
      webhookUrl,
    });
  }

  return createLocalOutboxEmailProvider(env);
}

export function createResendEmailProvider(input: {
  apiKey: string;
  fetchImpl?: FetchLike;
  fromEmail: string;
}): EmailProvider {
  const fetchImpl = input.fetchImpl ?? fetch;

  return {
    async sendEmail(message): Promise<void> {
      const headers: Record<string, string> = {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": USER_AGENT,
      };
      if (message.idempotencyKey) {
        headers["idempotency-key"] = message.idempotencyKey.slice(0, 256);
      }

      const response = await fetchImpl(RESEND_SEND_EMAIL_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: input.fromEmail,
          to: [message.toEmail],
          subject: message.subject,
          text: message.text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Email provider failed with ${response.status}`);
      }
    },
  };
}

export function createWebhookEmailProvider(input: {
  apiKey?: string;
  fetchImpl?: FetchLike;
  webhookUrl: string;
}): EmailProvider {
  const fetchImpl = input.fetchImpl ?? fetch;

  return {
    async sendEmail(message): Promise<void> {
      const response = await fetchImpl(input.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Email provider failed with ${response.status}`);
      }
    },
  };
}

export function createLocalOutboxEmailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  return {
    async sendEmail(message): Promise<void> {
      if (env.NODE_ENV === "production") {
        throw new Error("Email provider is not configured");
      }

      console.info("[local-email-outbox]", JSON.stringify(message));
    },
  };
}

export function createUnconfiguredEmailProvider(): EmailProvider {
  return {
    async sendEmail(): Promise<void> {
      throw new Error("Email provider is not configured");
    },
  };
}
