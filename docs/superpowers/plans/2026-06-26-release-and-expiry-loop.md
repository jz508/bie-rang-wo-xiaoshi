# Release Pipeline And Expiry Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android publishing repeatable with one command, and harden the backend失联触发闭环 from countdown expiry to contact notification task creation.

**Architecture:** Keep release automation in root `scripts/`, pure expiry/contact rules in `packages/domain`, and runtime orchestration in `apps/web`. The web service owns repository and delivery side effects; domain owns deterministic decisions and validation.

**Tech Stack:** Node.js ESM scripts, Expo/React Native Android Gradle build, Pgyer API v2, Next.js route handlers, Prisma, Vitest.

---

### Task 1: Android Pgyer Release Script

**Files:**
- Create: `scripts/release-android-pgyer.mjs`
- Modify: `package.json`
- Optional docs: `docs/release-android-pgyer.md`

- [ ] Add a Node ESM release script that can run mobile typecheck/test, build `app:assembleRelease`, validate APK metadata, upload via Pgyer API, and poll `buildInfo`.
- [ ] Read `PGYER_API_KEY` from the environment only; never print it.
- [ ] Add a root npm script such as `release:android:pgyer`.
- [ ] Support safe flags: `--dry-run`, `--upload`, `--skip-tests`, `--skip-build`.
- [ ] Verify `node scripts/release-android-pgyer.mjs --help` exits 0.

### Task 2: Domain Expiry And Notification Rules

**Files:**
- Create/modify: `packages/domain/src/expiry.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/__tests__/expiry.test.ts`

- [ ] Add pure rule functions for deadline evaluation, one-trigger-per-confirmation, enabled contact selection, and max 3 contacts.
- [ ] Treat timeout as minute-granularity.
- [ ] Export the rule functions and types.
- [ ] Cover not expired, just expired, inactive, already triggered, reconfirmed after trigger, disabled contacts, and more than 3 contacts.

### Task 3: Web Trigger Loop Hardening

**Files:**
- Modify: `apps/web/src/services/countdownService.ts`
- Modify: `apps/web/src/repositories/prismaMvpRepository.ts` only if needed
- Modify: `apps/web/app/api/cron/trigger-expired/route.ts` only if needed
- Test: `apps/web/src/__tests__/countdownService.test.ts` and/or `apps/web/src/__tests__/mvpFlow.test.ts`

- [ ] Use domain rules where appropriate to make trigger decisions explicit.
- [ ] Ensure only enabled/confirmed contacts are notified, up to 3 contacts per trigger.
- [ ] Preserve existing trigger claiming and idempotency behavior.
- [ ] Add regression tests for no duplicate delivery events across repeated cron calls and reconfirm-after-expiry behavior.

### Task 4: Integration Verification

**Files:**
- No production file ownership; verification only.

- [ ] Run `npm test --workspace @bie-rang-wo-xiaoshi/domain`.
- [ ] Run `npm test --workspace @bie-rang-wo-xiaoshi/web`.
- [ ] Run `npm run typecheck --workspace @bie-rang-wo-xiaoshi/web`.
- [ ] Run `npm run typecheck --workspace @bie-rang-wo-xiaoshi/mobile`.
- [ ] Run release script in `--dry-run` mode.
