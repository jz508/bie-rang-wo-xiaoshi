import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { EmailProvider } from "../adapters/emailProvider";

export type EmailAuthCodeRecord = {
  id: string;
  email: string;
  codeHash: string;
  attemptCount: number;
  consumedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
};

export type EmailAuthUserRecord = {
  id: string;
  email: string;
  emailVerifiedAt: Date;
  nickname: string;
};

export type EmailAuthRepository = {
  findLatestEmailLoginCode(email: string): Promise<EmailAuthCodeRecord | null>;
  createEmailLoginCode(input: {
    email: string;
    codeHash: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<EmailAuthCodeRecord>;
  incrementEmailLoginCodeAttempt(input: { codeId: string; attemptedAt: Date }): Promise<void>;
  consumeEmailLoginCode(input: { codeId: string; consumedAt: Date }): Promise<void>;
  upsertVerifiedEmailUser(input: {
    email: string;
    emailVerifiedAt: Date;
    nickname: string;
  }): Promise<EmailAuthUserRecord>;
};

export type RequestEmailLoginCodeResult = {
  email: string;
  expiresAt: Date;
};

export type VerifyEmailLoginCodeResult = {
  sessionToken: string;
  user: EmailAuthUserRecord;
};

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_PURPOSE = "email-session";

export async function requestEmailLoginCode(
  input: {
    email: string;
    now: Date;
    tokenSecret: string;
  },
  deps: {
    codeGenerator?: () => string;
    emailProvider: EmailProvider;
    repository: EmailAuthRepository;
  },
): Promise<RequestEmailLoginCodeResult> {
  const email = normalizeEmail(input.email);
  const latestCode = await deps.repository.findLatestEmailLoginCode(email);
  if (
    latestCode &&
    !latestCode.consumedAt &&
    input.now.getTime() - latestCode.createdAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    throw new Error("Email code was sent too recently");
  }

  const code = deps.codeGenerator?.() ?? generateSixDigitCode();
  if (!/^\d{6}$/.test(code)) {
    throw new Error("Generated email code is invalid");
  }

  const expiresAt = new Date(input.now.getTime() + CODE_TTL_MS);
  await deps.repository.createEmailLoginCode({
    email,
    codeHash: hashEmailCode({ code, email, secret: input.tokenSecret }),
    createdAt: input.now,
    expiresAt,
  });
  await deps.emailProvider.sendEmail({
    toEmail: email,
    subject: "别让我消失登录验证码",
    text: [
      `你的登录验证码是：${code}`,
      "验证码 10 分钟内有效。",
      "如果不是你本人操作，可以忽略这封邮件。",
    ].join("\n"),
    idempotencyKey: `email-login:${email}:${input.now.toISOString()}`,
  });

  return { email, expiresAt };
}

export async function verifyEmailLoginCode(
  input: {
    email: string;
    code: string;
    now: Date;
    tokenSecret: string;
  },
  deps: {
    repository: EmailAuthRepository;
  },
): Promise<VerifyEmailLoginCodeResult> {
  const email = normalizeEmail(input.email);
  const code = input.code.trim();
  const record = await deps.repository.findLatestEmailLoginCode(email);
  if (!record || record.consumedAt || record.expiresAt.getTime() <= input.now.getTime()) {
    throw new Error("Email code is invalid or expired");
  }
  if (record.attemptCount >= MAX_CODE_ATTEMPTS) {
    throw new Error("Email code attempt limit exceeded");
  }

  const expectedHash = hashEmailCode({ code, email, secret: input.tokenSecret });
  if (!safeEqual(record.codeHash, expectedHash)) {
    await deps.repository.incrementEmailLoginCodeAttempt({
      codeId: record.id,
      attemptedAt: input.now,
    });
    if (record.attemptCount + 1 >= MAX_CODE_ATTEMPTS) {
      throw new Error("Email code attempt limit exceeded");
    }
    throw new Error("Email code is invalid");
  }

  await deps.repository.consumeEmailLoginCode({
    codeId: record.id,
    consumedAt: input.now,
  });
  const user = await deps.repository.upsertVerifiedEmailUser({
    email,
    emailVerifiedAt: input.now,
    nickname: "我",
  });

  return {
    user,
    sessionToken: createEmailSessionToken({
      userId: user.id,
      expiresAt: new Date(input.now.getTime() + SESSION_TTL_MS),
      secret: input.tokenSecret,
    }),
  };
}

export function verifyEmailSessionToken(
  token: string,
  input: {
    now: Date;
    tokenSecret: string;
  },
): { userId: string } {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Session token format is invalid");
  }
  if (!safeEqual(signature, signSessionPayload(encodedPayload, input.tokenSecret))) {
    throw new Error("Session token signature is invalid");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Session token payload is invalid");
  }
  if (!isSessionTokenPayload(payload)) {
    throw new Error("Session token payload is invalid");
  }
  const expiresAt = new Date(payload.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= input.now.getTime()) {
    throw new Error("Session token has expired");
  }

  return { userId: payload.userId };
}

export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Email is invalid");
  }
  return normalized;
}

function createEmailSessionToken(input: {
  userId: string;
  expiresAt: Date;
  secret: string;
}): string {
  const payload = Buffer.from(
    JSON.stringify({
      purpose: SESSION_PURPOSE,
      userId: input.userId,
      expiresAt: input.expiresAt.toISOString(),
    }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${signSessionPayload(payload, input.secret)}`;
}

function hashEmailCode(input: { code: string; email: string; secret: string }): string {
  return createHmac("sha256", input.secret)
    .update(`${input.email}:${input.code}`)
    .digest("base64url");
}

function signSessionPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function isSessionTokenPayload(value: unknown): value is {
  purpose: typeof SESSION_PURPOSE;
  userId: string;
  expiresAt: string;
} {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.purpose === SESSION_PURPOSE &&
    typeof candidate.userId === "string" &&
    candidate.userId.length > 0 &&
    typeof candidate.expiresAt === "string" &&
    candidate.expiresAt.length > 0
  );
}
