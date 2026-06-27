import type { SmsProvider } from "../services/deliveryService";

export function createUnconfiguredSmsProvider(): SmsProvider {
  return {
    async sendTemplateSms(): Promise<void> {
      throw new Error("SMS provider is not configured");
    },
  };
}
