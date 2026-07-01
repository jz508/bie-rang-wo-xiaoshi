import { createPrismaMvpRepository } from "../../../../src/repositories/prismaMvpRepository";
import { isAuthResponse, requireAuthenticatedUser } from "../../../../src/runtime/auth";
import { getRuntimeConfig } from "../../../../src/runtime/config";
import { createContactInviteDelivery } from "../../../../src/runtime/delivery";
import { inviteContact } from "../../../../src/services/contactService";

type InviteContactRequestBody = {
  phone?: unknown;
  email?: unknown;
  displayName?: unknown;
  deliveryMode?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuthenticatedUser(request);
  if (isAuthResponse(auth)) {
    return auth;
  }

  const body = (await request.json().catch(() => ({}))) as InviteContactRequestBody;
  if (typeof body.phone !== "string" || body.phone.length === 0) {
    return Response.json({ error: "phone is required" }, { status: 400 });
  }
  if (typeof body.displayName !== "string" || body.displayName.length === 0) {
    return Response.json({ error: "displayName is required" }, { status: 400 });
  }

  try {
    const config = getRuntimeConfig(request);
    const repository = createPrismaMvpRepository();
    await repository.ensureVerifiedUserWithCountdown({
      userId: auth.userId,
      now: new Date(),
    });
    const result = await inviteContact(
      {
        userId: auth.userId,
        phone: body.phone,
        email: typeof body.email === "string" ? body.email : null,
        displayName: body.displayName,
        deliveryMode: body.deliveryMode === "manual" ? "manual" : "auto",
        now: new Date(),
        tokenSecret: config.tokenSecret,
        confirmationBaseUrl: config.confirmationBaseUrl,
      },
      {
        repository,
        delivery: createContactInviteDelivery(),
      },
    );

    return Response.json({
      contact: result.contact,
      confirmationUrl: `${config.confirmationBaseUrl.replace(/\/+$/, "")}/${result.token}`,
    });
  } catch (error) {
    return handleInviteError(error);
  }
}

function handleInviteError(error: unknown): Response {
  if (!(error instanceof Error)) {
    return Response.json({ error: "Failed to invite contact" }, { status: 500 });
  }

  if (
    error.message === "Sender not found" ||
    error.message === "Sender phone is not verified" ||
    error.message === "Contact already has a pending invite within 30 days" ||
    error.message === "Contact has blocked future invites"
  ) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  if (error.message === "Token secret is not configured" || error.message === "SMS provider is not configured") {
    return Response.json({ error: error.message }, { status: 503 });
  }

  return Response.json({ error: "Failed to invite contact" }, { status: 500 });
}
