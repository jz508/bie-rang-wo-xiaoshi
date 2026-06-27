import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenPurpose = "contact-confirmation" | "trigger-message";

export type SignedTokenPayload = {
  purpose: TokenPurpose;
  userId: string;
  contactId: string;
  idempotencyKey?: string;
  expiresAt: Date;
};

export type CreateSignedTokenInput = SignedTokenPayload & {
  secret: string;
};

export type VerifySignedTokenInput = {
  purpose: TokenPurpose;
  secret: string;
  now: Date;
};

type EncodedSignedTokenPayload = Omit<SignedTokenPayload, "expiresAt"> & {
  expiresAt: string;
};

export function createSignedToken(input: CreateSignedTokenInput): string {
  const encodedPayload = encodePayload({
    purpose: input.purpose,
    userId: input.userId,
    contactId: input.contactId,
    idempotencyKey: input.idempotencyKey,
    expiresAt: input.expiresAt.toISOString(),
  });
  const signature = sign(encodedPayload, input.secret);

  return `${encodedPayload}.${signature}`;
}

export function verifySignedToken(
  token: string,
  input: VerifySignedTokenInput,
): SignedTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Token format is invalid");
  }

  const [encodedPayload, signature] = parts as [string, string];
  if (!isValidSignature(encodedPayload, signature, input.secret)) {
    throw new Error("Token signature is invalid");
  }

  const payload = decodePayload(encodedPayload);
  if (payload.purpose !== input.purpose) {
    throw new Error("Token purpose is invalid");
  }

  if (payload.expiresAt.getTime() <= input.now.getTime()) {
    throw new Error("Token has expired");
  }

  return payload;
}

function encodePayload(payload: EncodedSignedTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encodedPayload: string): SignedTokenPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Token payload is invalid");
  }

  if (!isEncodedPayload(parsed)) {
    throw new Error("Token payload is invalid");
  }

  const expiresAt = new Date(parsed.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error("Token payload is invalid");
  }

  return {
    purpose: parsed.purpose,
    userId: parsed.userId,
    contactId: parsed.contactId,
    idempotencyKey: parsed.idempotencyKey,
    expiresAt,
  };
}

function isEncodedPayload(value: unknown): value is EncodedSignedTokenPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.purpose === "contact-confirmation" || candidate.purpose === "trigger-message") &&
    typeof candidate.userId === "string" &&
    candidate.userId.length > 0 &&
    typeof candidate.contactId === "string" &&
    candidate.contactId.length > 0 &&
    (candidate.idempotencyKey === undefined ||
      (typeof candidate.idempotencyKey === "string" && candidate.idempotencyKey.length > 0)) &&
    typeof candidate.expiresAt === "string" &&
    candidate.expiresAt.length > 0
  );
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function isValidSignature(encodedPayload: string, signature: string, secret: string): boolean {
  const expected = sign(encodedPayload, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
