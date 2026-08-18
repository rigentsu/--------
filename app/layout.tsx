import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "よりそいナビ｜不登校支援の選択サポート",
  description:
    "现实条件を整理し、確認済みデータから複数の支援の選択肢を比べるための開発デモ。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
