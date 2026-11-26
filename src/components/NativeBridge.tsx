"use client";
import { useEffect } from "react";

type Plugin = { addListener?: (e: string, cb: (x: { url: string }) => void) => Promise<{ remove: () => void }>; close?: () => Promise<void> };
type Cap = { isNativePlatform?: () => boolean; Plugins?: Record<string, Plugin> };

/** "ph.com.sunnyfoods.order" etc. — the APK's id, also its link scheme (mobile/apk/build-one.sh). */
export const APP_SCHEME_BY_HOST: Record<string, string> = { order: "ph.com.sunnyfoods.order", agent: "ph.com.sunnyfoods.agent", app: "ph.com.sunnyfoods.staff" };

/**
 * Only inside the Android APKs: Google / Facebook login runs in the phone's browser
 * (Google and Facebook refuse logins inside app web views). When it finishes, the
 * phone reopens the app at "<scheme>://auth/callback?code=…"; this hands the code to
 * the server, which finishes the login inside the app.
 */
export function NativeBridge() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: Cap }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const app = cap.Plugins?.App;
    let handle: { remove: () => void } | undefined;
    app?.addListener?.("appUrlOpen", ({ url }) => {
      if (!/^[a-z.]+:\/\/auth\/callback/.test(url)) return;
      cap.Plugins?.Browser?.close?.().catch(() => {});
      const u = new URL(url.replace(/^[a-z.]+:\/\//, "https://x/"));
      const code = u.searchParams.get("code");
      const next = "/api/auth/after?area=portal";
      location.href = code
        ? `/api/auth/confirm?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`
        : "/portal/login?error=oauth";
    }).then((h) => { handle = h; }).catch(() => {});
    return () => handle?.remove();
  }, []);
  return null;
}
