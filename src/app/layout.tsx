import type { Metadata, Viewport } from "next";
import { Lora, Nunito_Sans, Noto_Sans_SC, Noto_Sans_TC } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { NativeBridge } from "@/components/NativeBridge";
import "./globals.css";

const lora = Lora({ variable: "--font-lora", subsets: ["latin"] });
const nunito = Nunito_Sans({ variable: "--font-nunito", subsets: ["latin"] });
const notoSC = Noto_Sans_SC({ variable: "--font-noto-sc", subsets: ["latin"], preload: false, weight: ["400", "700"] });
const notoTC = Noto_Sans_TC({ variable: "--font-noto-tc", subsets: ["latin"], preload: false, weight: ["400", "700"] });

export const metadata: Metadata = {
  title: { default: "Sunny Foods", template: "%s · Sunny Foods" },
  description: "Sunny Foods Inc. — Delicious • Healthy • Affordable",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#B81C21",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${lora.variable} ${nunito.variable} ${notoSC.variable} ${notoTC.variable} h-full antialiased`}>
      <body className="min-h-full">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <NativeBridge />
      </body>
    </html>
  );
}
