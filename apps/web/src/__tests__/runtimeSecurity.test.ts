import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthenticatedUser, requireAuthenticatedUser } from "../runtime/auth";
import { authorizeCronRequest } from "../runtime/cronAuth";
import { getRuntimeConfig } from "../runtime/config";
import { GET, POST } from "../../app/api/cron/trigger-expired/route";

describe("runtime auth boundary", () => {
  it("requires an authenticated user header for write routes", async () => {
    const response = requireAuthenticatedUser(new Request("https://app.test/api/messages/review"));

    expect(response).toBeInstanceOf(Response);
    if (response instanceof Response) {
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Authentication is required" });
    }
  });

  it("derives user identity from the session boundary, not request body", () => {
    const user = getAuthenticatedUser(
      new Request("https://app.test/api/countdown/confirm", {
        headers: {
          "x-demo-user-id": "user-session",
        },
        method: "POST",
        body: JSON.stringify({ userId: "attacker" }),
      }),
    );

    expect(user).toEqual({ userId: "user-session" });
  });
});

describe("cron auth boundary", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.unstubAllEnvs();
  });

  it("rejects cron requests without the configured secret", async () => {
    process.env.CRON_SECRET = "cron-secret";

    const response = authorizeCronRequest(new Request("https://app.test/api/cron/trigger-expired"));

    expect(response).toBeInstanceOf(Response);
    if (response instanceof Response) {
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    }
  });

  it("fails closed in production when cron secret is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = authorizeCronRequest(new Request("https://app.test/api/cron/trigger-expired"));

    expect(response).toBeInstanceOf(Response);
    if (response instanceof Response) {
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "Cron secret is not configured" });
    }
  });

  it("allows cron requests with the configured secret", () => {
    process.env.CRON_SECRET = "cron-secret";

    const response = authorizeCronRequest(
      new Request("https://app.test/api/cron/trigger-expired", {
        headers: {
          "x-cron-secret": "cron-secret",
        },
      }),
    );

    expect(response).toBeNull();
  });

  it("allows Vercel cron bearer authorization", () => {
    process.env.CRON_SECRET = "cron-secret";

    const response = authorizeCronRequest(
      new Request("https://app.test/api/cron/trigger-expired", {
        headers: {
          authorization: "Bearer cron-secret",
        },
      }),
    );

    expect(response).toBeNull();
  });

  it("supports GET for cron providers while keeping POST for manual triggers", () => {
    expect(GET).toBe(POST);
  });
});

describe("runtime trigger delivery configuration", () => {
  afterEach(() => {
    delete process.env.APP_BASE_URL;
    delete process.env.BIE_RANG_WO_XIAOSHI_TOKEN_SECRET;
    delete process.env.TOKEN_SECRET;
    delete process.env.TRIGGER_DELIVERY_CHANNEL;
  });

  it("defaults expired countdown delivery to email", () => {
    const config = getRuntimeConfig(new Request("https://app.test/api/cron/trigger-expired"));

    expect(config.triggerDeliveryChannel).toBe("email");
  });

  it("accepts an explicit SMS trigger delivery channel", () => {
    process.env.TRIGGER_DELIVERY_CHANNEL = "sms";

    const config = getRuntimeConfig(new Request("https://app.test/api/cron/trigger-expired"));

    expect(config.triggerDeliveryChannel).toBe("sms");
  });

  it("rejects invalid trigger delivery channel configuration", () => {
    process.env.TRIGGER_DELIVERY_CHANNEL = "push";

    expect(() => getRuntimeConfig(new Request("https://app.test/api/cron/trigger-expired"))).toThrow(
      "Trigger delivery channel is invalid",
    );
  });
});
