import type { ReactNode } from "react";

export const metadata = {
  title: "别让我消失",
  description: "失联倒计时与预留消息 MVP",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
