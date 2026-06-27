import type { DeliveryChannel } from "@bie-rang-wo-xiaoshi/domain";

export type RuntimeConfig = {
  confirmationBaseUrl: string;
  messageBaseUrl: string;
  tokenSecret: string;
  triggerDeliveryChannel: DeliveryChannel | "auto";
};

const DEFAULT_LOCAL_BASE_URL = "http://localhost:3000";

export function getRuntimeConfig(request?: Request): RuntimeConfig {
  const baseUrl = getBaseUrl(request);

  return {
    confirmationBaseUrl: `${baseUrl}/c`,
    messageBaseUrl: `${baseUrl}/m`,
    tokenSecret: getTokenSecret(),
    triggerDeliveryChannel: getTriggerDeliveryChannel(),
  };
}

function getBaseUrl(request?: Request): string {
  const configuredBaseUrl = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL is not configured");
  }

  if (request) {
    return new URL(request.url).origin;
  }

  return DEFAULT_LOCAL_BASE_URL;
}

function getTokenSecret(): string {
  const secret =
    process.env.BIE_RANG_WO_XIAOSHI_TOKEN_SECRET ??
    process.env.TOKEN_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "development-token-secret");

  if (!secret) {
    throw new Error("Token secret is not configured");
  }

  return secret;
}

function getTriggerDeliveryChannel(): DeliveryChannel | "auto" {
  const channel = process.env.TRIGGER_DELIVERY_CHANNEL?.trim().toLowerCase() || "email";
  if (channel === "email" || channel === "sms" || channel === "auto") {
    return channel;
  }

  throw new Error("Trigger delivery channel is invalid");
}
