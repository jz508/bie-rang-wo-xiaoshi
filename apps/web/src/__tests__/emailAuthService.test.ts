import { beforeEach, describe, expect, it } from "vitest";
import type { EmailMessage, EmailProvider } from "../adapters/emailProvider";
import {
  requestEmailLoginCode,
  verifyEmailLoginCode,
  verifyEmailSessionToken,
  type EmailAuthCodeRecord,
  type EmailAuthRepository,
  type EmailAuthUserRecord,
} from "../services/emailAuthService";

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

describe("email auth service", () => {
  const now = new Date("2026-07-02T10:00:00.000Z");
  const tokenSecret = "auth-secret";
  let repository: FakeEmailAuthRepository;
  let emailProvider: FakeEmailProvider;

  beforeEach(() => {
    repository = new FakeEmailAuthRepository();
    emailProvider = new FakeEmailProvider();
  });

  it("sends a six-digit login code to a normalized email", async () => {
    const result = await requestEmailLoginCode(
      {
        email: "  USER@Example.COM  ",
        now,
        tokenSecret,
      },
      {
        codeGenerator: () => "123456",
        emailProvider,
        repository,
      },
    );

    expect(result).toEqual({
      email: "user@example.com",
      expiresAt: new Date("2026-07-02T10:10:00.000Z"),
    });
    expect(repository.codes).toHaveLength(1);
    expect(repository.codes[0]).toMatchObject({
      email: "user@example.com",
      attemptCount: 0,
      consumedAt: null,
      createdAt: now,
      expiresAt: new Date("2026-07-02T10:10:00.000Z"),
    });
    expect(repository.codes[0]?.codeHash).not.toBe("123456");
    expect(emailProvider.messages).toHaveLength(1);
    expect(emailProvider.messages[0]).toMatchObject({
      toEmail: "user@example.com",
      subject: "\u522b\u8ba9\u6211\u6d88\u5931\u767b\u5f55\u9a8c\u8bc1\u7801",
      idempotencyKey: `email-login:user@example.com:${now.toISOString()}`,
    });
    expect(emailProvider.messages[0]?.text).toContain("123456");
    expect(emailProvider.messages[0]?.text).toContain("10 \u5206\u949f");
  });

  it("blocks repeated code requests within sixty seconds", async () => {
    await requestEmailLoginCode(
      { email: "user@example.com", now, tokenSecret },
      { codeGenerator: () => "123456", emailProvider, repository },
    );

    await expect(
      requestEmailLoginCode(
        {
          email: "user@example.com",
          now: new Date("2026-07-02T10:00:59.000Z"),
          tokenSecret,
        },
        { codeGenerator: () => "654321", emailProvider, repository },
      ),
    ).rejects.toThrow("Email code was sent too recently");
    expect(repository.codes).toHaveLength(1);
  });

  it("verifies the latest code and returns a bearer session token", async () => {
    await requestEmailLoginCode(
      { email: "user@example.com", now, tokenSecret },
      { codeGenerator: () => "123456", emailProvider, repository },
    );

    const result = await verifyEmailLoginCode(
      {
        email: "USER@example.com",
        code: "123456",
        now: new Date("2026-07-02T10:02:00.000Z"),
        tokenSecret,
      },
      { repository },
    );

    expect(result.user).toEqual({
      id: "user-1",
      email: "user@example.com",
      emailVerifiedAt: new Date("2026-07-02T10:02:00.000Z"),
      nickname: "\u6211",
    });
    expect(result.sessionToken).toEqual(expect.any(String));
    expect(repository.codes[0]?.consumedAt).toEqual(new Date("2026-07-02T10:02:00.000Z"));
    expect(
      verifyEmailSessionToken(result.sessionToken, {
        now: new Date("2026-07-02T10:03:00.000Z"),
        tokenSecret,
      }),
    ).toEqual({ userId: "user-1" });
  });

  it("rejects expired codes", async () => {
    await requestEmailLoginCode(
      { email: "user@example.com", now, tokenSecret },
      { codeGenerator: () => "123456", emailProvider, repository },
    );

    await expect(
      verifyEmailLoginCode(
        {
          email: "user@example.com",
          code: "123456",
          now: new Date("2026-07-02T10:10:01.000Z"),
          tokenSecret,
        },
        { repository },
      ),
    ).rejects.toThrow("Email code is invalid or expired");
  });

  it("expires a code after five wrong attempts", async () => {
    await requestEmailLoginCode(
      { email: "user@example.com", now, tokenSecret },
      { codeGenerator: () => "123456", emailProvider, repository },
    );

    for (let index = 0; index < 5; index += 1) {
      await expect(
        verifyEmailLoginCode(
          {
            email: "user@example.com",
            code: "000000",
            now: new Date(now.getTime() + (index + 1) * 1000),
            tokenSecret,
          },
          { repository },
        ),
      ).rejects.toThrow(index === 4 ? "Email code attempt limit exceeded" : "Email code is invalid");
    }

    await expect(
      verifyEmailLoginCode(
        {
          email: "user@example.com",
          code: "123456",
          now: new Date("2026-07-02T10:01:00.000Z"),
          tokenSecret,
        },
        { repository },
      ),
    ).rejects.toThrow("Email code attempt limit exceeded");
  });
});
