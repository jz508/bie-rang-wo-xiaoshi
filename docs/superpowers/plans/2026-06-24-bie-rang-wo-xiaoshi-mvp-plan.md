# 《别让我消失》MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable MVP of 《别让我消失》: a minute-level lost-contact countdown with confirmed emergency contacts, fixed-template notifications, H5 confirmation/message pages, anti-abuse controls, and optional night mode.

**Architecture:** Use a greenfield monorepo. The mobile app owns onboarding, countdown display, settings, and confirmation actions. The web/API app owns authentication, server-side timers, contact confirmation H5 pages, signed message links, SMS/email delivery, and moderation rules. Shared domain code holds validation, template, timer, and anti-abuse logic so the mobile and server do not drift.

**Tech Stack:** Expo React Native + TypeScript for the mobile app; Next.js + TypeScript for API/H5 pages; Prisma + Postgres for persistence; provider adapters for SMS/email; Vitest for domain/API tests; React Native Testing Library for mobile component tests; npm workspaces for local package management.

---

## Scope Check

The product spec spans multiple independent subsystems:

1. Mobile app experience.
2. Authentication and server-side countdown state.
3. Contact confirmation H5 and notification delivery.
4. Message templates, content review, and anti-abuse controls.

Implement this as phased MVP work. Each phase should be independently testable before moving on.

## Recommended File Structure

```text
apps/
  mobile/
    app/
      index.tsx
      onboarding.tsx
      settings.tsx
    src/
      components/
        CountdownDisplay.tsx
        ConfirmButton.tsx
        ContactSummary.tsx
        ThemeToggleRow.tsx
      screens/
        HomeScreen.tsx
        OnboardingScreen.tsx
        SettingsScreen.tsx
      state/
        countdownStore.ts
      theme/
        tokens.ts
      __tests__/
        HomeScreen.test.tsx
        SettingsScreen.test.tsx
  web/
    app/
      api/
        auth/verify-phone/route.ts
        countdown/confirm/route.ts
        contacts/invite/route.ts
        contacts/respond/route.ts
        messages/review/route.ts
        cron/trigger-expired/route.ts
      c/
        [token]/page.tsx
      m/
        [token]/page.tsx
    src/
      services/
        contactService.ts
        countdownService.ts
        deliveryService.ts
        messageReviewService.ts
        tokenService.ts
      adapters/
        smsProvider.ts
        emailProvider.ts
      __tests__/
        contactService.test.ts
        countdownService.test.ts
        messageReviewService.test.ts
packages/
  domain/
    src/
      antiAbuse.ts
      countdown.ts
      messageTemplates.ts
      moderation.ts
      schemas.ts
    __tests__/
      antiAbuse.test.ts
      countdown.test.ts
      moderation.test.ts
      schemas.test.ts
prisma/
  schema.prisma
```

## Phase 0: Scaffold And Shared Domain

**Files:**
- Create: `package.json`
- Create: root `package.json` with npm workspaces
- Create: `packages/domain/src/countdown.ts`
- Create: `packages/domain/src/messageTemplates.ts`
- Create: `packages/domain/src/moderation.ts`
- Create: `packages/domain/src/antiAbuse.ts`
- Create: `packages/domain/src/schemas.ts`
- Test: `packages/domain/__tests__/countdown.test.ts`
- Test: `packages/domain/__tests__/moderation.test.ts`
- Test: `packages/domain/__tests__/antiAbuse.test.ts`

- [ ] **Step 1: Scaffold the monorepo**

Create the root workspace and shared domain package with TypeScript and Vitest. Mobile and Web framework scaffolds are created in their own phases to keep Phase 0 focused on reusable product rules.

Run:

```powershell
npm init -y
npm install --save-dev typescript vitest prettier eslint
New-Item -ItemType Directory -Force -Path packages/domain/src,packages/domain/__tests__,apps,prisma
```

Expected: root npm workspace files and `packages/domain` exist.

- [ ] **Step 2: Add countdown domain tests**

Create `packages/domain/__tests__/countdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getExpiresAt, getRemainingSeconds } from "../src/countdown";

describe("countdown domain", () => {
  it("requires at least one minute", () => {
    expect(() => getExpiresAt(new Date("2026-06-24T00:00:00Z"), 0)).toThrow(
      "Countdown duration must be at least 1 minute",
    );
  });

  it("computes expiration from duration minutes", () => {
    expect(getExpiresAt(new Date("2026-06-24T00:00:00Z"), 135).toISOString()).toBe(
      "2026-06-24T02:15:00.000Z",
    );
  });

  it("never returns negative remaining seconds", () => {
    expect(
      getRemainingSeconds(
        new Date("2026-06-24T02:16:00Z"),
        new Date("2026-06-24T02:15:00Z"),
      ),
    ).toBe(0);
  });
});
```

- [ ] **Step 3: Implement countdown domain**

Create `packages/domain/src/countdown.ts`:

```ts
export function getExpiresAt(startedAt: Date, durationMinutes: number): Date {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
    throw new Error("Countdown duration must be at least 1 minute");
  }

  return new Date(startedAt.getTime() + durationMinutes * 60_000);
}

export function getRemainingSeconds(now: Date, expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}
```

- [ ] **Step 4: Add moderation tests**

Create `packages/domain/__tests__/moderation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reviewShortNote } from "../src/moderation";

describe("reviewShortNote", () => {
  it("accepts an empty note", () => {
    expect(reviewShortNote("").status).toBe("approved");
  });

  it("accepts a human short note", () => {
    expect(reviewShortNote("备用钥匙在物业，请先联系我妈妈。").status).toBe("approved");
  });

  it("rejects links", () => {
    expect(reviewShortNote("打开 https://spam.example.com 领取优惠").status).toBe("rejected");
  });

  it("rejects phone-like contact info", () => {
    expect(reviewShortNote("加我微信 13800138000").status).toBe("rejected");
  });

  it("rejects marketing terms", () => {
    expect(reviewShortNote("代理返现，进群领优惠").status).toBe("rejected");
  });

  it("rejects notes longer than 50 characters", () => {
    expect(reviewShortNote("这是一段超过五十个中文字符的备注内容，用来模拟用户试图提交过长内容造成审核失败的情况。").status).toBe("rejected");
  });
});
```

- [ ] **Step 5: Implement moderation**

Create `packages/domain/src/moderation.ts`:

```ts
export type ReviewResult =
  | { status: "approved"; normalizedNote: string }
  | { status: "rejected"; reason: string };

const blockedPatterns = [
  /https?:\/\//i,
  /www\./i,
  /\b\d{7,}\b/,
  /微信|VX|QQ|邮箱|二维码|群号|加群|优惠|折扣|代理|返现|招聘|兼职|贷款|博彩/i,
];

export function reviewShortNote(note: string): ReviewResult {
  const normalizedNote = note.trim();

  if (normalizedNote.length === 0) {
    return { status: "approved", normalizedNote: "" };
  }

  if ([...normalizedNote].length > 50) {
    return { status: "rejected", reason: "Short note must be 50 characters or fewer" };
  }

  if (blockedPatterns.some((pattern) => pattern.test(normalizedNote))) {
    return { status: "rejected", reason: "Short note contains disallowed promotional or contact content" };
  }

  return { status: "approved", normalizedNote };
}
```

- [ ] **Step 6: Add anti-abuse tests**

Create `packages/domain/__tests__/antiAbuse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canSendInvite } from "../src/antiAbuse";

describe("canSendInvite", () => {
  it("allows first invite", () => {
    expect(canSendInvite(null, new Date("2026-06-24T00:00:00Z"))).toBe(true);
  });

  it("blocks repeat invite within 30 days", () => {
    expect(
      canSendInvite(
        new Date("2026-06-01T00:00:00Z"),
        new Date("2026-06-24T00:00:00Z"),
      ),
    ).toBe(false);
  });

  it("allows invite after 30 days", () => {
    expect(
      canSendInvite(
        new Date("2026-05-01T00:00:00Z"),
        new Date("2026-06-24T00:00:00Z"),
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 7: Implement anti-abuse invite rule**

Create `packages/domain/src/antiAbuse.ts`:

```ts
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function canSendInvite(lastInviteAt: Date | null, now: Date): boolean {
  if (!lastInviteAt) {
    return true;
  }

  return now.getTime() - lastInviteAt.getTime() >= THIRTY_DAYS_MS;
}
```

- [ ] **Step 8: Run domain tests**

Run:

```powershell
npm exec vitest run packages/domain/__tests__
```

Expected: all domain tests pass.

- [ ] **Step 9: Commit**

```powershell
git add package.json package-lock.json packages/domain
git commit -m "feat: add shared domain rules for countdown and anti-abuse"
```

## Phase 1: Mobile App Shell

**Files:**
- Create: `apps/mobile` Expo app scaffold
- Create: `apps/mobile/src/theme/tokens.ts`
- Create: `apps/mobile/src/components/CountdownDisplay.tsx`
- Create: `apps/mobile/src/components/ConfirmButton.tsx`
- Create: `apps/mobile/src/components/ContactSummary.tsx`
- Create: `apps/mobile/src/screens/HomeScreen.tsx`
- Create: `apps/mobile/src/screens/SettingsScreen.tsx`
- Modify: `apps/mobile/app/index.tsx`
- Modify: `apps/mobile/app/settings.tsx`
- Test: `apps/mobile/src/__tests__/HomeScreen.test.tsx`
- Test: `apps/mobile/src/__tests__/SettingsScreen.test.tsx`

- [ ] **Step 1: Build theme tokens**

Create tokens for default light mode and user-enabled night mode. Night mode defaults off.

```ts
export const themes = {
  light: {
    background: "#F6F8FA",
    surface: "#FFFFFF",
    text: "#171717",
    mutedText: "#66717A",
    hairline: "#DDE3E8",
    accent: "#8E514A",
    primaryButton: "#181A1B",
    primaryButtonText: "#FFFFFF",
  },
  night: {
    background: "#0C0D0F",
    surface: "#15171A",
    text: "#F2F3F4",
    mutedText: "#8D949B",
    hairline: "#2A2E33",
    accent: "#A46A55",
    primaryButton: "#F2F3F4",
    primaryButtonText: "#111315",
  },
} as const;

export type ThemeName = keyof typeof themes;
```

- [ ] **Step 2: Build home screen**

The home screen shows only title, status, subtitle, timer, `我还在`, contact summary, and message preview. Do not add footer explanatory copy.

Required visible text:

```text
别让我消失
守护中
如果我没有回来确认
02:15:00
我还在
紧急联系人
陈默
预留消息
请联系我，或者来找我。
```

- [ ] **Step 3: Add home screen tests**

Test that the home screen includes required content and excludes forbidden footer copy.

```ts
expect(screen.getByText("别让我消失")).toBeTruthy();
expect(screen.getByText("我还在")).toBeTruthy();
expect(screen.queryByText("下一次触发前，我会保持安静。")).toBeNull();
expect(screen.queryByText("倒计时归零后，会把我提前写好的消息发给紧急联系人。")).toBeNull();
```

- [ ] **Step 4: Build settings night mode toggle**

Settings page includes:

```text
夜间模式
开启后使用深色背景，降低夜间查看时的刺眼感。
```

Toggling it switches theme locally. Persist it in local storage after the first UI pass.

- [ ] **Step 5: Run mobile tests**

```powershell
npm test --workspace apps/mobile
```

Expected: home and settings tests pass.

## Phase 2: Server Data Model And Countdown

**Files:**
- Create: `apps/web` Next.js app scaffold
- Create: `prisma/schema.prisma`
- Create: `apps/web/src/services/countdownService.ts`
- Create: `apps/web/app/api/countdown/confirm/route.ts`
- Create: `apps/web/app/api/cron/trigger-expired/route.ts`
- Test: `apps/web/src/__tests__/countdownService.test.ts`

- [ ] **Step 1: Add Prisma models**

Core tables:

```prisma
model User {
  id              String   @id @default(cuid())
  phone           String   @unique
  nickname        String
  createdAt       DateTime @default(now())
  countdown       Countdown?
  contacts        EmergencyContact[]
}

model Countdown {
  id              String   @id @default(cuid())
  userId          String   @unique
  durationMinutes Int
  lastConfirmedAt DateTime
  expiresAt       DateTime
  status          String
  user            User     @relation(fields: [userId], references: [id])
}

model EmergencyContact {
  id              String   @id @default(cuid())
  userId          String
  phone           String
  email           String?
  displayName     String
  status          String
  lastInviteAt    DateTime?
  blockedAt       DateTime?
  createdAt       DateTime @default(now())
  user            User     @relation(fields: [userId], references: [id])
}

model PresetMessage {
  id              String   @id @default(cuid())
  userId          String
  templateKey     String
  shortNote       String
  reviewStatus    String
  reviewReason    String?
  updatedAt       DateTime @updatedAt
}

model DeliveryEvent {
  id              String   @id @default(cuid())
  userId          String
  contactId       String
  channel         String
  status          String
  reason          String?
  createdAt       DateTime @default(now())
}
```

- [ ] **Step 2: Implement confirm service**

`confirmCountdown(userId, now)` resets `lastConfirmedAt`, recomputes `expiresAt`, and sets status to `active`.

- [ ] **Step 3: Implement expired countdown job**

`trigger-expired` finds active countdowns where `expiresAt <= now`, re-reviews the short note, sends notifications only to confirmed contacts, and records delivery events.

- [ ] **Step 4: Run server countdown tests**

```powershell
npm test --workspace apps/web -- countdownService
```

Expected: confirmation reset and expired trigger tests pass.

## Phase 3: Contact Confirmation H5 And Delivery

**Files:**
- Create: `apps/web/src/services/contactService.ts`
- Create: `apps/web/src/services/tokenService.ts`
- Create: `apps/web/src/services/deliveryService.ts`
- Create: `apps/web/src/adapters/smsProvider.ts`
- Create: `apps/web/src/adapters/emailProvider.ts`
- Create: `apps/web/app/c/[token]/page.tsx`
- Create: `apps/web/app/m/[token]/page.tsx`
- Create: `apps/web/app/api/contacts/invite/route.ts`
- Create: `apps/web/app/api/contacts/respond/route.ts`
- Test: `apps/web/src/__tests__/contactService.test.ts`

- [ ] **Step 1: Implement signed token service**

Tokens must include purpose, userId, contactId, expiry, and HMAC signature.

Purposes:

```ts
type TokenPurpose = "contact-confirmation" | "trigger-message";
```

- [ ] **Step 2: Implement contact invite service**

Rules:

- Sender user must have verified phone.
- Invite SMS uses fixed provider template.
- No custom user text in invite SMS.
- Same phone cannot receive another invite within 30 days while unconfirmed.
- If contact selected `拒绝` or `不再接收`, block future invites to that phone for that user.

- [ ] **Step 3: Build confirmation H5 page**

The page shows who invited the contact, what will happen, and four actions:

```text
同意
拒绝
举报
不再接收
```

- [ ] **Step 4: Build trigger message H5 page**

The page is fixed-structure only:

```text
{用户昵称} 超过设定时间没有确认

预留消息：
{模板内容}
{审核通过的短备注}

这条消息由 TA 提前设置，仅发送给已确认的紧急联系人。
```

No images, attachments, rich text, or external links.

- [ ] **Step 5: Run contact tests**

```powershell
npm test --workspace apps/web -- contactService
```

Expected: invite throttling, confirmation, rejection, and opt-out tests pass.

## Phase 4: Message Templates, Review, And Abuse Controls

**Files:**
- Create: `apps/web/src/services/messageReviewService.ts`
- Create: `apps/web/app/api/messages/review/route.ts`
- Modify: `packages/domain/src/messageTemplates.ts`
- Modify: `packages/domain/src/moderation.ts`
- Test: `apps/web/src/__tests__/messageReviewService.test.ts`

- [ ] **Step 1: Add fixed templates**

Create templates:

```ts
export const messageTemplates = [
  {
    key: "contact_or_find_me",
    text: "请联系我，或者来找我。",
  },
  {
    key: "contact_family_first",
    text: "如果联系不上我，请先联系我的家人。",
  },
  {
    key: "help_confirm_situation",
    text: "我可能遇到了一些情况，请帮我确认一下。",
  },
] as const;
```

- [ ] **Step 2: Implement save-time review**

When user submits a short note:

- Empty note is allowed.
- 50 characters max.
- Disallowed contact/marketing patterns reject the note.
- Store review status and reason.

- [ ] **Step 3: Implement trigger-time review**

Before sending a trigger link, review the latest short note again. If rejected, send only the selected fixed template.

- [ ] **Step 4: Implement report handling**

If a contact taps `举报`:

- Record an abuse event.
- Suppress that contact from future deliveries for that user.
- If user reaches threshold, pause SMS trigger capability.

- [ ] **Step 5: Run review tests**

```powershell
npm test --workspace apps/web -- messageReviewService
```

Expected: blocked content falls back to template and report handling pauses risky users.

## Phase 5: MVP End-To-End Verification

**Files:**
- Create: `apps/web/src/__tests__/mvpFlow.test.ts`
- Create: `apps/mobile/src/__tests__/onboardingFlow.test.tsx`

- [ ] **Step 1: Verify onboarding happy path**

Expected flow:

1. User verifies phone.
2. User sets nickname.
3. User adds contact phone.
4. User selects `请联系我，或者来找我。`.
5. User sets `2 小时 15 分钟`.
6. Contact receives invite SMS.
7. Contact confirms through H5.
8. User sees contact as confirmed.

- [ ] **Step 2: Verify expired trigger happy path**

Expected flow:

1. Countdown expires server-side.
2. User phone receives no loud push.
3. Confirmed contact receives fixed-template SMS.
4. Link opens fixed message page.
5. Delivery event is recorded.

- [ ] **Step 3: Verify abuse prevention**

Expected cases:

- Unconfirmed contact receives no trigger SMS.
- Repeat invite within 30 days is blocked.
- Short note containing link is rejected.
- Trigger-time review falls back to default template.
- `不再接收` suppresses future invites.

- [ ] **Step 4: Verify night mode**

Expected:

- Night mode is default off.
- Turning it on switches home/settings/confirmation pages to dark theme.
- Turning it on does not change countdown or notification logic.

## Execution Recommendation

Start with Phase 0 and Phase 3 before polishing mobile UI. The risky part is not the timer; it is contact consent, notification delivery, and anti-abuse. Once those foundations are reliable, the mobile UI can stay extremely small and trustworthy.
