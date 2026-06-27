# Backend Email Deployment

This is the first real notification rollout path for expired countdown alerts.

## Required runtime variables

Set these for the web deployment:

```powershell
APP_BASE_URL="https://your-domain.example"
BIE_RANG_WO_XIAOSHI_TOKEN_SECRET="<long-random-secret>"
CRON_SECRET="<long-random-cron-secret>"
TRIGGER_DELIVERY_CHANNEL="email"
```

`TRIGGER_DELIVERY_CHANNEL` accepts:

- `email`: prefer email, fall back to SMS if a contact has no email.
- `sms`: prefer SMS, fall back to email if a contact has no phone.
- `auto`: current legacy behavior, prefer SMS when a phone exists.

## Resend email provider

Recommended first provider:

```powershell
RESEND_API_KEY="<resend-api-key>"
EMAIL_FROM="别让我消失 <alerts@your-domain.example>"
```

The app sends `POST https://api.resend.com/emails` with `from`, `to`, `subject`, and `text`. The delivery idempotency key is passed to the provider when available.

## Generic email webhook fallback

Use this if email sending is handled by your own service:

```powershell
EMAIL_PROVIDER_WEBHOOK_URL="https://your-email-worker.example/send"
EMAIL_PROVIDER_API_KEY="<optional-bearer-token>"
```

The webhook receives the full email message as JSON.

## Local development behavior

When no email provider is configured and `NODE_ENV` is not `production`, emails are written to the console as `[local-email-outbox]`.

In production, missing email configuration fails closed with `Email provider is not configured`.

## Cron call

Call the trigger endpoint with the cron secret:

```powershell
curl -X POST "https://your-domain.example/api/cron/trigger-expired" -H "x-cron-secret: <long-random-cron-secret>"
```

## Database schema

The current Prisma schema uses `DeliveryEvent.idempotencyKey` as the unique delivery guard. Before deploying a real database, apply the schema using the project's chosen flow, for example `prisma migrate deploy` for migrations or `prisma db push` for a prototype database.
