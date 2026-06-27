import { createPrismaMvpRepository } from "../../../../src/repositories/prismaMvpRepository";
import { isAuthResponse, requireAuthenticatedUser } from "../../../../src/runtime/auth";
import { reviewAndSavePresetMessage } from "../../../../src/services/messageReviewService";

type ReviewMessageRequestBody = {
  templateKey?: unknown;
  shortNote?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuthenticatedUser(request);
  if (isAuthResponse(auth)) {
    return auth;
  }

  const body = (await request.json().catch(() => ({}))) as ReviewMessageRequestBody;

  if (typeof body.templateKey !== "string" || body.templateKey.length === 0) {
    return Response.json({ error: "templateKey is required" }, { status: 400 });
  }
  if (body.shortNote !== undefined && typeof body.shortNote !== "string") {
    return Response.json({ error: "shortNote must be a string" }, { status: 400 });
  }

  try {
    const repository = createPrismaMvpRepository();
    await repository.ensureVerifiedUserWithCountdown({
      userId: auth.userId,
      now: new Date(),
    });
    const message = await reviewAndSavePresetMessage({
      userId: auth.userId,
      templateKey: body.templateKey,
      shortNote: body.shortNote,
      now: new Date(),
    }, { repository });
    return Response.json({ message });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid message template key") {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ error: "Failed to review message" }, { status: 500 });
  }
}
