# No-SMS Trigger Loop Design

## Goal

Until company SMS qualifications are available, the app must still have a real lost-contact loop: a confirmed contact must be reachable when the countdown expires.

## Decision

Use email as the only production trigger channel for now. Contacts still include a phone number for identity and future SMS support, but a contact without an email cannot be counted as reachable and cannot unlock "start guard".

## Behavior

- Adding a contact requires name, phone, and email in the mobile app.
- The manual confirmation-link flow remains unchanged.
- A confirmed contact is reachable only when enabled and has an email.
- Countdown triggering with `TRIGGER_DELIVERY_CHANNEL=email` sends only email and does not fall back to SMS.
- Future SMS support can use `TRIGGER_DELIVERY_CHANNEL=auto` or a dedicated SMS configuration after qualifications are ready.

## Non-Goals

- Do not enable Tencent Cloud SMS.
- Do not change the visual direction of the app.
- Do not run Android native builds locally.

## Verification

- Backend tests prove email mode skips contacts without email.
- Mobile tests prove a contact email is required and that only confirmed contacts with email enable guarding.
- Run lightweight tests/typechecks only; Android APK is built in GitHub Actions if a release is needed.
