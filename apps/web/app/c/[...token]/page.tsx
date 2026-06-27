import type { CSSProperties } from "react";

import { createPrismaMvpRepository } from "../../../src/repositories/prismaMvpRepository";
import { getRuntimeConfig } from "../../../src/runtime/config";
import {
  getContactConfirmationPageData,
  type ContactConfirmationPageData,
} from "../../../src/services/pageDataService";

type ContactConfirmationPageProps = {
  params: Promise<{
    token: string[];
  }>;
};

export const dynamic = "force-dynamic";

export default async function ContactConfirmationPage({ params }: ContactConfirmationPageProps) {
  const { token: tokenSegments } = await params;
  const token = tokenSegments.join("/");
  const data = await getContactConfirmationPageData({
    token,
    now: new Date(),
    secret: getRuntimeConfig().tokenSecret,
    repository: createPrismaMvpRepository(),
  });

  return (
    <main style={pageStyle}>
      <section style={panelStyle} aria-labelledby="contact-confirmation-title">
        <p style={eyebrowStyle}>紧急联系人确认</p>
        {data.kind === "ready" ? <ReadyState data={data} /> : <InvalidState />}
      </section>
    </main>
  );
}

function ReadyState({ data }: { data: Extract<ContactConfirmationPageData, { kind: "ready" }> }) {
  const statusText = getContactStatusText(data.contactStatus);

  return (
    <>
      <h1 id="contact-confirmation-title" style={titleStyle}>
        {data.inviterNickname} 邀请你成为紧急联系人
      </h1>
      <p style={bodyStyle}>
        同意后，只有当对方超过自己设定的时间没有确认安全状态时，你才可能收到固定模板消息。
      </p>
      <p style={bodyStyle}>
        这条链路不允许自定义广告、外部链接、图片、附件或富文本。
      </p>
      {data.contactStatus === "pending" ? (
        <form method="post" action="/api/contacts/respond" style={actionsStyle}>
          <input type="hidden" name="token" value={data.token} />
          <button name="action" value="agree" type="submit" style={primaryButtonStyle}>
            同意
          </button>
          <button name="action" value="decline" type="submit" style={secondaryButtonStyle}>
            拒绝
          </button>
          <button name="action" value="report" type="submit" style={secondaryButtonStyle}>
            举报
          </button>
          <button name="action" value="opt_out" type="submit" style={secondaryButtonStyle}>
            不再接收
          </button>
        </form>
      ) : (
        <p style={statusStyle}>{statusText}</p>
      )}
    </>
  );
}

function InvalidState() {
  return (
    <>
      <h1 id="contact-confirmation-title" style={titleStyle}>
        链接不可用
      </h1>
      <p style={bodyStyle}>这个邀请链接无效、已过期，或邀请已经被处理。</p>
    </>
  );
}

function getContactStatusText(
  status: Extract<ContactConfirmationPageData, { kind: "ready" }>["contactStatus"],
): string {
  return contactStatusText[status] ?? "这个邀请已经被处理。";
}

const contactStatusText: Partial<
  Record<Extract<ContactConfirmationPageData, { kind: "ready" }>["contactStatus"], string>
> = {
  blocked: "你已选择不再接收这类邀请。",
  confirmed: "你已经同意成为紧急联系人。",
  declined: "你已经拒绝这次邀请。",
  reported: "你已经举报这次邀请。",
};

const pageStyle = {
  minHeight: "100vh",
  boxSizing: "border-box",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "#f6f8fa",
  color: "#171717",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} satisfies CSSProperties;

const panelStyle = {
  width: "min(100%, 440px)",
  boxSizing: "border-box",
  padding: "28px",
  border: "1px solid #dde3e8",
  borderRadius: "8px",
  background: "#ffffff",
} satisfies CSSProperties;

const eyebrowStyle = {
  margin: "0 0 12px",
  color: "#66717a",
  fontSize: "14px",
} satisfies CSSProperties;

const titleStyle = {
  margin: "0 0 18px",
  fontSize: "26px",
  lineHeight: 1.25,
  letterSpacing: 0,
} satisfies CSSProperties;

const bodyStyle = {
  margin: "0 0 14px",
  color: "#374151",
  fontSize: "16px",
  lineHeight: 1.7,
} satisfies CSSProperties;

const statusStyle = {
  margin: "22px 0 0",
  padding: "14px 16px",
  borderRadius: "8px",
  background: "#f6f8fa",
  color: "#171717",
  fontSize: "16px",
  lineHeight: 1.6,
} satisfies CSSProperties;

const actionsStyle = {
  display: "grid",
  gap: "10px",
  marginTop: "24px",
} satisfies CSSProperties;

const primaryButtonStyle = {
  minHeight: "44px",
  border: "1px solid #181a1b",
  borderRadius: "6px",
  background: "#181a1b",
  color: "#ffffff",
  fontSize: "16px",
} satisfies CSSProperties;

const secondaryButtonStyle = {
  minHeight: "44px",
  border: "1px solid #cbd3da",
  borderRadius: "6px",
  background: "#ffffff",
  color: "#171717",
  fontSize: "16px",
} satisfies CSSProperties;
