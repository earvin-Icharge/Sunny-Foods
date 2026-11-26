"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabaseBrowser } from "@/lib/supabase/client";
import { afterLogin } from "@/app/actions/auth";
import { AREAS, type Area } from "@/lib/areas";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { CodeForm } from "./CodeForm";

/** Email + password login (staff, agents, and customers who prefer a password). */
export function LoginForm({ area, title, footer, error }: { area: Area; title: string; footer?: React.ReactNode; error?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const prefix = AREAS[area].prefix;
  const [mode, setMode] = useState<"login" | "forgot" | "code">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // ?error=… from an email link or the after-login check (e.g. "awaiting_approval")
  const [msg, setMsg] = useState<{ tone: "error" | "ok"; text: string } | null>(
    error ? { tone: error === "awaiting_approval" ? "ok" : "error", text: t.has(error) ? t(error) : t("loginFailed") } : null);
  const [busy, setBusy] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      // Signed up but never typed the email code: ask for it here (with "send again").
      if (error.code === "email_not_confirmed" || error.message.includes("confirm")) { setMode("code"); return; }
      setMsg({ tone: "error", text: t("wrongPassword") });
      return;
    }
    await finish();
  }

  async function finish() {
    const r = await afterLogin(area);
    setBusy(false);
    if (r.next) { router.replace(r.next); return; }
    if (!r.ok) { setMode("login"); setMsg({ tone: r.error === "awaiting_approval" ? "ok" : "error", text: t(r.error ?? "wrongApp") }); return; }
    router.replace(r.mustChangePassword ? `${prefix}/reset-password?first=1` : prefix);
    router.refresh();
  }

  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/api/auth/confirm?next=${encodeURIComponent(prefix + "/reset-password")}`,
    });
    setBusy(false);
    setMsg({ tone: "ok", text: t("resetSent") });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <AuthHeader />
      {mode === "code" ? <div className="card"><CodeForm email={email.trim()} type="signup" onVerified={finish} onBack={() => setMode("login")} /></div> : (
      <div className="card">
        <h1 className="mb-4 text-2xl font-bold">{mode === "login" ? title : t("forgotTitle")}</h1>
        <form onSubmit={mode === "login" ? login : forgot} className="grid gap-3">
          <label><span className="label">{t("email")}</span>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {mode === "login" && (
            <label><span className="label">{t("password")}</span>
              <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          )}
          {msg && <p className={`rounded-lg p-3 text-sm ${msg.tone === "error" ? "bg-st-problem/10 text-st-problem" : "bg-st-ok/10 text-st-ok"}`}>{msg.text}</p>}
          <button className="btn-primary" disabled={busy}>{busy ? "…" : mode === "login" ? t("login") : t("sendResetLink")}</button>
        </form>
        <button className="mt-3 text-sm font-semibold text-sunny" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setMsg(null); }}>
          {mode === "login" ? t("forgotPassword") : t("backToLogin")}
        </button>
      </div>)}
      {footer}
      <p className="text-center text-xs text-brown/60">
        <Link href={`${prefix}/privacy`} className="underline">{t("privacy")}</Link> · <Link href={`${prefix}/terms`} className="underline">{t("terms")}</Link>
      </p>
    </main>
  );
}
