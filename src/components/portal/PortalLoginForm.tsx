"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isNativeApp } from "@/lib/portal-client";
import { afterLogin } from "@/app/actions/auth";
import { APP_SCHEME_BY_HOST } from "@/components/NativeBridge";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { CodeForm } from "@/components/auth/CodeForm";

type Mode = "choose" | "phone" | "email" | "code-sms" | "code-email";

/** 09171234567 / 9171234567 / +63 917 123 4567 -> +639171234567 */
export function toPhilippinePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (/^09\d{9}$/.test(d)) return "+63" + d.slice(1);
  if (/^9\d{9}$/.test(d)) return "+63" + d;
  return "+" + d;
}

/**
 * Customer login = sign-up (decision D1, 2026-11-26): the customer picks the easiest way —
 * Google, Facebook, phone (SMS code) or email (code, no password). New customers then fill
 * in their business details once (/portal/welcome). Password login stays for old accounts.
 */
export function PortalLoginForm({ signup, refCode, error }: { signup?: boolean; refCode?: string; error?: string }) {
  const t = useTranslations("auth");
  const tp = useTranslations("portal");
  const router = useRouter();
  const sb = supabaseBrowser();
  const [mode, setMode] = useState<Mode>("choose");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "ok"; text: string } | null>(
    error ? { tone: error === "awaiting_approval" ? "ok" : "error", text: t.has(error) ? t(error) : t("loginFailed") } : null);

  // Agent's invite link (?ref=CODE): remember the code for the business-details form.
  useEffect(() => {
    if (refCode) document.cookie = `sf_ref=${encodeURIComponent(refCode)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }, [refCode]);

  async function done() {
    const r = await afterLogin("portal");
    setBusy(false);
    if (r.next) { router.replace(r.next); return; }
    if (!r.ok) { setMode("choose"); setMsg({ tone: "error", text: t(r.error ?? "wrongApp") }); return; }
    router.replace("/portal");
    router.refresh();
  }

  async function social(provider: "google" | "facebook") {
    setBusy(true); setMsg(null);
    const native = isNativeApp();
    const scheme = APP_SCHEME_BY_HOST[location.hostname.split(".")[0]] ?? APP_SCHEME_BY_HOST.order;
    const redirectTo = native ? `${scheme}://auth/callback`
      : `${location.origin}/api/auth/confirm?next=${encodeURIComponent("/api/auth/after?area=portal")}`;
    const { data, error: err } = await sb.auth.signInWithOAuth({
      provider, options: { redirectTo, skipBrowserRedirect: native, scopes: provider === "facebook" ? "email" : undefined },
    });
    if (err || !data?.url) { setBusy(false); setMsg({ tone: "error", text: t("loginFailed") }); return; }
    if (native) {
      // Google and Facebook do not allow logins inside app web views: use the phone's browser.
      const cap = (window as unknown as { Capacitor?: { Plugins?: { Browser?: { open: (o: { url: string }) => Promise<void> } } } }).Capacitor;
      await cap?.Plugins?.Browser?.open({ url: data.url });
      setBusy(false);
    }
  }

  async function sendPhone(e: React.FormEvent) {
    e.preventDefault();
    const p = toPhilippinePhone(phone);
    if (!/^\+\d{10,15}$/.test(p)) { setMsg({ tone: "error", text: t("badPhone") }); return; }
    setBusy(true); setMsg(null);
    const { error: err } = await sb.auth.signInWithOtp({ phone: p });
    setBusy(false);
    if (err) { setMsg({ tone: "error", text: t(err.status === 429 ? "tooManyCodes" : "codeNotSent") }); return; }
    setPhone(p); setMode("code-sms");
  }

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const em = email.trim().toLowerCase();
    const { error: err } = await sb.auth.signInWithOtp({
      email: em, options: { emailRedirectTo: `${location.origin}/api/auth/confirm?next=${encodeURIComponent("/api/auth/after?area=portal")}` },
    });
    setBusy(false);
    if (err) { setMsg({ tone: "error", text: t(err.status === 429 ? "tooManyCodes" : "codeNotSent") }); return; }
    setEmail(em); setMode("code-email");
  }

  const back = () => { setMode("choose"); setMsg(null); };
  const notice = msg && <p className={`rounded-lg p-3 text-sm ${msg.tone === "error" ? "bg-st-problem/10 text-st-problem" : "bg-st-ok/10 text-st-ok"}`}>{msg.text}</p>;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <div className="flex items-center justify-between">
        <Image src="/logo.png" alt="Sunny Foods" width={160} height={80} priority />
        <LanguageSwitcher />
      </div>
      <div className="card grid gap-3">
        {mode === "code-sms" || mode === "code-email" ? (
          <CodeForm type={mode === "code-sms" ? "sms" : "email"} phone={phone} email={email} onBack={back}
            onVerified={async () => { setBusy(true); await done(); }} />
        ) : mode === "phone" ? (
          <form onSubmit={sendPhone} className="grid gap-3">
            <h1 className="text-2xl font-bold">{t("withPhone")}</h1>
            <label><span className="label">{t("mobileNumber")}</span>
              <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" required value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            {notice}
            <button className="btn-primary" disabled={busy}>{busy ? "…" : t("sendCode")}</button>
            <button type="button" className="text-sm font-semibold text-sunny" onClick={back}>← {t("otherWays")}</button>
          </form>
        ) : mode === "email" ? (
          <form onSubmit={sendEmail} className="grid gap-3">
            <h1 className="text-2xl font-bold">{t("withEmail")}</h1>
            <label><span className="label">{t("email")}</span>
              <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {notice}
            <button className="btn-primary" disabled={busy}>{busy ? "…" : t("sendCode")}</button>
            <button type="button" className="text-sm font-semibold text-sunny" onClick={back}>← {t("otherWays")}</button>
          </form>
        ) : (
          <>
            <h1 className="text-2xl font-bold">{signup ? t("createAccount") : t("customerLogin")}</h1>
            <p className="text-sm text-brown/70">{t("chooseWay")}</p>
            {notice}
            <button className="btn-secondary justify-start gap-3" disabled={busy} onClick={() => social("google")}>
              <GoogleIcon /> {t("withGoogle")}</button>
            <button className="btn-secondary justify-start gap-3" disabled={busy} onClick={() => social("facebook")}>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[#1877F2] text-sm font-bold text-white">f</span> {t("withFacebook")}</button>
            <button className="btn-secondary justify-start gap-3" disabled={busy} onClick={() => { setMode("phone"); setMsg(null); }}>
              <span aria-hidden>📱</span> {t("withPhone")}</button>
            <button className="btn-secondary justify-start gap-3" disabled={busy} onClick={() => { setMode("email"); setMsg(null); }}>
              <span aria-hidden>✉️</span> {t("withEmail")}</button>
            <p className="text-center text-xs text-brown/60">{t("newCustomersNote")}</p>
            <Link href="/portal/login?password=1" className="text-center text-sm font-semibold text-sunny">{t("withPassword")}</Link>
          </>
        )}
      </div>
      <Link href="/portal/browse" className="text-center text-sm font-semibold text-sunny">{tp("browseProducts")}</Link>
      <p className="text-center text-xs text-brown/60">
        <Link href="/portal/privacy" className="underline">{t("privacy")}</Link> · <Link href="/portal/terms" className="underline">{t("terms")}</Link>
      </p>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
