# Email Trigger Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real email notification path for expired countdown alerts without changing the app UI.

**Architecture:** Keep `triggerExpiredCountdowns` as the orchestration point. Introduce channel preference into the service so delivery event records match the channel the runtime sender will use. Extend runtime delivery with a Resend/webhook/local email provider while preserving the existing SMS provider.

**Tech Stack:** Next.js route handlers, TypeScript, Vitest, Prisma, Fetch API, Resend REST API.

---

### Task 1: Channel Preference In Countdown Service

**Files:**
- Modify: `apps/web/src/services/countdownService.ts`
- Modify: `apps/web/src/__tests__/countdownService.test.ts`

- [ ] Add tests showing `preferredChannel: "email"` sends to contacts with email and records `channel: "email"`.
- [ ] Add tests showing email preference falls back to SMS when email is absent.
- [ ] Add tests showing SMS preference falls back to email when phone is absent.
- [ ] Implement `preferredChannel?: DeliveryChannel | "auto"` and use it when building idempotency keys.
- [ ] Run `npm test --workspace @bie-rang-wo-xiaoshi/web -- src/__tests__/countdownService.test.ts`.

### Task 2: Runtime Email Provider

**Files:**
- Modify: `apps/web/src/adapters/emailProvider.ts`
- Modify: `apps/web/src/runtime/delivery.ts`
- Create: `apps/web/src/__tests__/runtimeDelivery.test.ts`

- [ ] Add tests for Resend email provider request shape and secret handling.
- [ ] Add tests for local outbox throwing in production when no provider is configured.
- [ ] Add tests for runtime sender preferring email and returning failed when the contact lacks the selected channel.
- [ ] Implement `createRuntimeEmailProvider`, `createResendEmailProvider`, `createWebhookEmailProvider`, and `createLocalOutboxEmailProvider`.
- [ ] Update `createTriggerDeliverySender` to accept SMS and email providers plus channel preference.
- [ ] Run `npm test --workspace @bie-rang-wo-xiaoshi/web -- src/__tests__/runtimeDelivery.test.ts`.

### Task 3: Cron Route Configuration

**Files:**
- Modify: `apps/web/src/runtime/config.ts`
- Modify: `apps/web/app/api/cron/trigger-expired/route.ts`
- Modify: `apps/web/src/__tests__/runtimeSecurity.test.ts`

- [ ] Add config tests for `TRIGGER_DELIVERY_CHANNEL=email|sms|auto` and invalid values.
- [ ] Pass configured channel into `triggerExpiredCountdowns` and `createTriggerDeliverySender`.
- [ ] Make invalid runtime channel fail with a clear 503 instead of a generic 500.
- [ ] Run `npm test --workspace @bie-rang-wo-xiaoshi/web -- src/__tests__/runtimeSecurity.test.ts`.

### Task 4: Verification And Docs

**Files:**
- Create: `docs/backend-email-deployment.md`

- [ ] Document required env vars and the local dry-run behavior.
- [ ] Run `npm run typecheck --workspace @bie-rang-wo-xiaoshi/web`.
- [ ] Run `npm run test:web`.
- [ ] Run `npm run test:domain`.
- [ ] Run `npm run validate:prisma`.
- [ ] Run `node --test scripts/release-android-pgyer.test.mjs`.
