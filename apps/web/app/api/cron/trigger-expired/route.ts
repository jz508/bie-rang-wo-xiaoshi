import { createPrismaMvpRepository } from "../../../../src/repositories/prismaMvpRepository";
import { getRuntimeConfig } from "../../../../src/runtime/config";
import { authorizeCronRequest } from "../../../../src/runtime/cronAuth";
import { createTriggerDeliverySender } from "../../../../src/runtime/delivery";
import { triggerExpiredCountdowns } from "../../../../src/services/countdownService";

export async function POST(request: Request): Promise<Response> {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const config = getRuntimeConfig(request);
    const result = await triggerExpiredCountdowns(new Date(), {
      repository: createPrismaMvpRepository(),
      delivery: createTriggerDeliverySender(),
      messageBaseUrl: config.messageBaseUrl,
      messageTokenSecret: config.tokenSecret,
      preferredDeliveryChannel: config.triggerDeliveryChannel,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && isRuntimeConfigurationError(error)) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    return Response.json({ error: "Failed to trigger expired countdowns" }, { status: 500 });
  }
}

function isRuntimeConfigurationError(error: Error): boolean {
  return (
    error.message === "APP_BASE_URL is not configured" ||
    error.message === "Token secret is not configured" ||
    error.message === "Trigger delivery channel is invalid"
  );
}
