import type { CSSProperties } from "react";

import { createPrismaMvpRepository } from "../../../src/repositories/prismaMvpRepository";
import { getRuntimeConfig } from "../../../src/runtime/config";
import { getTriggerMessagePageData } from "../../../src/services/pageDataService";

type TriggerMessagePageProps = {
  params: Promise<{
    token: string[];
  }>;
};

export const dynamic = "force-dynamic";

export default async function TriggerMessagePage({ params }: TriggerMessagePageProps) {
  const { token: tokenSegments } = await params;
  const token = tokenSegments.join("/");
  const data = await getTriggerMessagePageData({
    token,
    now: new Date(),
    secret: getRuntimeConfig().tokenSecret,
    repository: createPrismaMvpRepository(),
  });

  return (
    <main style={pageStyle}>
      <article style={messageStyle} aria-label="预留消息">
        {data.kind === "ready" ? (
          <>
            <p style={headlineStyle}>{data.userNickname} 超过设定时间没有确认</p>
            <p style={labelStyle}>预留消息</p>
            <p style={plainTextStyle}>{data.templateText}</p>
            {data.shortNote ? <p style={plainTextStyle}>{data.shortNote}</p> : null}
            <p style={footnoteStyle}>这条内容来自已触发的固定模板快照，仅展示给已确认的紧急联系人。</p>
          </>
        ) : (
          <>
            <p style={headlineStyle}>链接不可用</p>
            <p style={plainTextStyle}>这条消息链接无效、已过期，或对应的触发记录不存在。</p>
          </>
        )}
      </article>
    </main>
  );
}

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

const messageStyle = {
  width: "min(100%, 460px)",
  boxSizing: "border-box",
  padding: "28px",
  border: "1px solid #dde3e8",
  borderRadius: "8px",
  background: "#ffffff",
} satisfies CSSProperties;

const headlineStyle = {
  margin: "0 0 22px",
  fontSize: "24px",
  lineHeight: 1.35,
  letterSpacing: 0,
  fontWeight: 700,
} satisfies CSSProperties;

const labelStyle = {
  margin: "0 0 10px",
  color: "#66717a",
  fontSize: "15px",
} satisfies CSSProperties;

const plainTextStyle = {
  margin: "0 0 12px",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: "17px",
  lineHeight: 1.7,
} satisfies CSSProperties;

const footnoteStyle = {
  margin: "24px 0 0",
  paddingTop: "16px",
  borderTop: "1px solid #dde3e8",
  color: "#66717a",
  fontSize: "14px",
  lineHeight: 1.6,
} satisfies CSSProperties;
