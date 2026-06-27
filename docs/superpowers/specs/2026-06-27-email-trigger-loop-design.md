# Email Trigger Loop Design

**Goal:** Make the expired-countdown backend able to send real email alerts before SMS is ready.

**Approved scope:** Build the first real notification channel for the existing cron trigger path. Keep SMS support intact, but let runtime prefer email when configured. Do not add a new product surface or change the app UI in this step.

**Approach:** Add an email provider behind the existing `DeliverySender` boundary. Runtime delivery chooses a channel based on a configurable preference: `email`, `sms`, or `auto`. Email delivery uses Resend when `RESEND_API_KEY` and `EMAIL_FROM` are present, falls back to a generic webhook when `EMAIL_PROVIDER_WEBHOOK_URL` is present, and logs to a local outbox in non-production.

**Data flow:** `/api/cron/trigger-expired` calls `triggerExpiredCountdowns`; the service claims expired countdowns, loads up to three confirmed contacts, selects a channel, builds the signed message URL, sends through the runtime sender, and writes a `DeliveryEvent` with the same channel and idempotency key.

**Configuration:** Production requires `APP_BASE_URL`, token secret, cron secret, and either Resend or email webhook credentials for email mode. `TRIGGER_DELIVERY_CHANNEL=email` is the recommended first rollout setting. Real database schema changes must be applied with the project's Prisma deployment flow.

**Testing:** Add failing tests first for email channel selection and runtime provider behavior, then implement. Verify web typecheck, web tests, domain tests, Prisma validation, and release script tests.
