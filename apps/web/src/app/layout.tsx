import type { Metadata } from "next";
import { geistMono, instrument, schibsted } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NidhiKavach", template: "%s · NidhiKavach" },
  description: "Security deposit & FDR lifecycle portal for AICTE (SIH26265 prototype).",
  icons: { icon: "/assets/logo.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${schibsted.variable} ${geistMono.variable} ${instrument.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
