import { createRuntimeEmailProvider } from "../../../../../src/adapters/emailProvider";
import { createPrismaMvpRepository } from "../../../../../src/repositories/prismaMvpRepository";
import { getRuntimeConfig } from "../../../../../src/runtime/config";
import { requestEmailLoginCode } from "../../../../../src/services/emailAuthService";

type RequestCodeBody = {
  email?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as RequestCodeBody;
  if (typeof body.email !== "string" || !body.email.trim()) {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }

  try {
    const result = await requestEmailLoginCode(
      {
        email: body.email,
        now: new Date(),
        tokenSecret: getRuntimeConfig(request).tokenSecret,
      },
      {
        emailProvider: createRuntimeEmailProvider(),
        repository: createPrismaMvpRepository(),
      },
    );

    return Response.json({
      email: result.email,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (error) {
    return mapRequestCodeError(error);
  }
}

function mapRequestCodeError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "";
  if (message === "Email is invalid") {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (message === "Email code was sent too recently") {
    return Response.json({ error: "Please wait before requesting another code" }, { status: 429 });
  }
  if (message === "Email provider is not configured") {
    return Response.json({ error: "Email provider is not configured" }, { status: 503 });
  }

  return Response.json({ error: "Failed to request email code" }, { status: 500 });
}
