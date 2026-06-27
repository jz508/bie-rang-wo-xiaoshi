import { createPrismaMvpRepository } from "../../../../src/repositories/prismaMvpRepository";
import { isAuthResponse, requireAuthenticatedUser } from "../../../../src/runtime/auth";
import { pauseCountdown } from "../../../../src/services/countdownService";

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuthenticatedUser(request);
  if (isAuthResponse(auth)) {
    return auth;
  }

  try {
    const repository = createPrismaMvpRepository();
    const countdown = await pauseCountdown(auth.userId, new Date(), repository);
    return Response.json({ countdown });
  } catch {
    return Response.json({ error: "Failed to pause countdown" }, { status: 500 });
  }
}
