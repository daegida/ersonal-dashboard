import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인 대시보드",
  description: "날씨, 증시, 몸무게, 러닝을 한 화면에서 보는 개인 대시보드"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
