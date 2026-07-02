import { createPrismaMvpRepository } from "../../../../../src/repositories/prismaMvpRepository";
import { getRuntimeConfig } from "../../../../../src/runtime/config";
import { verifyEmailLoginCode } from "../../../../../src/services/emailAuthService";

type VerifyCodeBody = {
  code?: unknown;
  email?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as VerifyCodeBody;
  if (typeof body.email !== "string" || !body.email.trim()) {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (typeof body.code !== "string" || !body.code.trim()) {
    return Response.json({ error: "A valid code is required" }, { status: 400 });
  }

  try {
    const result = await verifyEmailLoginCode(
      {
        email: body.email,
        code: body.code,
        now: new Date(),
        tokenSecret: getRuntimeConfig(request).tokenSecret,
      },
      {
        repository: createPrismaMvpRepository(),
      },
    );

    return Response.json({
      sessionToken: result.sessionToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        nickname: result.user.nickname,
        emailVerifiedAt: result.user.emailVerifiedAt.toISOString(),
      },
    });
  } catch (error) {
    return mapVerifyCodeError(error);
  }
}

function mapVerifyCodeError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "";
  if (message === "Email is invalid") {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (
    message === "Email code is invalid" ||
    message === "Email code is invalid or expired" ||
    message === "Email code attempt limit exceeded"
  ) {
    return Response.json({ error: "Email code is invalid or expired" }, { status: 401 });
  }

  return Response.json({ error: "Failed to verify email code" }, { status: 500 });
}
