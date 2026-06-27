import { createPrismaMvpRepository } from "../../../../src/repositories/prismaMvpRepository";
import { isAuthResponse, requireAuthenticatedUser } from "../../../../src/runtime/auth";
import { confirmCountdown } from "../../../../src/services/countdownService";

type ConfirmRequestBody = {
  durationMinutes?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuthenticatedUser(request);
  if (isAuthResponse(auth)) {
    return auth;
  }

  const body = (await request.json().catch(() => ({}))) as ConfirmRequestBody;
  const durationMinutes =
    typeof body.durationMinutes === "number" && Number.isInteger(body.durationMinutes)
      ? body.durationMinutes
      : undefined;
  if (body.durationMinutes !== undefined && (!durationMinutes || durationMinutes < 1)) {
    return Response.json({ error: "durationMinutes must be a positive integer" }, { status: 400 });
  }

  try {
    const repository = createPrismaMvpRepository();
    await repository.ensureVerifiedUserWithCountdown({
      userId: auth.userId,
      durationMinutes,
      now: new Date(),
    });
    const countdown = await confirmCountdown(
      auth.userId,
      new Date(),
      repository,
      durationMinutes,
    );
    return Response.json({ countdown });
  } catch {
    return Response.json({ error: "Failed to confirm countdown" }, { status: 500 });
  }
}
