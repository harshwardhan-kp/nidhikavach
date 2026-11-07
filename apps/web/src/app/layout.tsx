import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { geistMono, instrument, schibsted } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NidhiKavach", template: "%s · NidhiKavach" },
  description: "Security deposit & FDR lifecycle portal for AICTE (SIH26265 prototype).",
  icons: { icon: "/assets/logo.png" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${schibsted.variable} ${geistMono.variable} ${instrument.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
