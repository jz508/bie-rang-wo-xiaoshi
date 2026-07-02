import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailMessage, EmailProvider } from "../adapters/emailProvider";
import type {
  EmailAuthCodeRecord,
  EmailAuthRepository,
  EmailAuthUserRecord,
} from "../services/emailAuthService";

const routeMocks = vi.hoisted(() => ({
  emailProvider: null as EmailProvider | null,
  repository: null as EmailAuthRepository | null,
}));

vi.mock("../adapters/emailProvider", () => ({
  createRuntimeEmailProvider: () => {
    if (!routeMocks.emailProvider) {
      throw new Error("Email provider mock is not configured");
    }

    return routeMocks.emailProvider;
  },
}));

vi.mock("../repositories/prismaMvpRepository", () => ({
  createPrismaMvpRepository: () => {
    if (!routeMocks.repository) {
      throw new Error("Repository mock is not configured");
    }

    return routeMocks.repository;
  },
}));

import { GET as getMe } from "../../app/api/auth/me/route";
import { POST as requestCode } from "../../app/api/auth/email/request-code/route";
import { POST as verifyCode } from "../../app/api/auth/email/verify-code/route";

class FakeEmailProvider implements EmailProvider {
  messages: EmailMessage[] = [];

  async sendEmail(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

class FakeEmailAuthRepository implements EmailAuthRepository {
  codes: EmailAuthCodeRecord[] = [];
  users = new Map<string, EmailAuthUserRecord>();
  nextCodeId = 1;
  nextUserId = 1;

  async findLatestEmailLoginCode(email: string): Promise<EmailAuthCodeRecord | null> {
    return (
      this.codes
        .filter((code) => code.email === email)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async createEmailLoginCode(input: {
    email: string;
    codeHash: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<EmailAuthCodeRecord> {
    const record: EmailAuthCodeRecord = {
      id: `code-${this.nextCodeId++}`,
      email: input.email,
      codeHash: input.codeHash,
      attemptCount: 0,
      consumedAt: null,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    };
    this.codes.push(record);
    return record;
  }

  async incrementEmailLoginCodeAttempt(input: { codeId: string; attemptedAt: Date }): Promise<void> {
    this.codes = this.codes.map((code) =>
      code.id === input.codeId ? { ...code, attemptCount: code.attemptCount + 1 } : code,
    );
  }

  async consumeEmailLoginCode(input: { codeId: string; consumedAt: Date }): Promise<void> {
    this.codes = this.codes.map((code) =>
      code.id === input.codeId ? { ...code, consumedAt: input.consumedAt } : code,
    );
  }

  async upsertVerifiedEmailUser(input: {
    email: string;
    emailVerifiedAt: Date;
    nickname: string;
  }): Promise<EmailAuthUserRecord> {
    const existing = this.users.get(input.email);
    const user: EmailAuthUserRecord = existing
      ? { ...existing, emailVerifiedAt: input.emailVerifiedAt }
      : {
          id: `user-${this.nextUserId++}`,
          email: input.email,
          emailVerifiedAt: input.emailVerifiedAt,
          nickname: input.nickname,
        };
    this.users.set(input.email, user);
    return user;
  }
}

describe("email auth API routes", () => {
  let emailProvider: FakeEmailProvider;
  let repository: FakeEmailAuthRepository;

  beforeEach(() => {
    process.env.TOKEN_SECRET = "route-secret";
    emailProvider = new FakeEmailProvider();
    repository = new FakeEmailAuthRepository();
    routeMocks.emailProvider = emailProvider;
    routeMocks.repository = repository;
  });

  it("requests an email login code", async () => {
    const response = await requestCode(jsonRequest("/api/auth/email/request-code", { email: "USER@example.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      email: "user@example.com",
      expiresAt: expect.any(String),
    });
    expect(emailProvider.messages).toHaveLength(1);
    expect(emailProvider.messages[0]?.toEmail).toBe("user@example.com");
  });

  it("rejects invalid request-code input", async () => {
    const response = await requestCode(jsonRequest("/api/auth/email/request-code", { email: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "A valid email is required" });
  });

  it("verifies an email code and returns a bearer session token", async () => {
    await requestCode(jsonRequest("/api/auth/email/request-code", { email: "user@example.com" }));

    const response = await verifyCode(
      jsonRequest("/api/auth/email/verify-code", {
        email: "user@example.com",
        code: latestEmailCode(emailProvider),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sessionToken: expect.any(String),
      user: {
        id: "user-1",
        email: "user@example.com",
      },
    });
  });

  it("returns the authenticated bearer user from me", async () => {
    await requestCode(jsonRequest("/api/auth/email/request-code", { email: "user@example.com" }));
    const verifyResponse = await verifyCode(
      jsonRequest("/api/auth/email/verify-code", {
        email: "user@example.com",
        code: latestEmailCode(emailProvider),
      }),
    );
    const { sessionToken } = (await verifyResponse.json()) as { sessionToken: string };

    const response = await getMe(
      new Request("https://app.test/api/auth/me", {
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: { id: "user-1" } });
  });

  it("rejects unauthenticated me requests", async () => {
    const response = await getMe(new Request("https://app.test/api/auth/me"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication is required" });
  });
});

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`https://app.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function latestEmailCode(provider: FakeEmailProvider): string {
  const text = provider.messages.at(-1)?.text ?? "";
  const code = text.match(/\b\d{6}\b/)?.[0];

  if (!code) {
    throw new Error("Email code was not sent");
  }

  return code;
}
