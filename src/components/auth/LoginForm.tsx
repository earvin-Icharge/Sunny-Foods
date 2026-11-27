"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabaseBrowser } from "@/lib/supabase/client";
import { afterLogin, passwordLogin, type LoginState } from "@/app/actions/auth";
import { AREAS, type Area } from "@/lib/areas";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { CodeForm } from "./CodeForm";

/**
 * Email + password login (staff, agents, and customers who prefer a password).
 * The login itself runs on the server (passwordLogin), so it also works on slow phones,
 * old browsers and in-app browsers, even before this page's script has loaded.
 */
export function LoginForm({ area, title, footer, error }: { area: Area; title: string; footer?: React.ReactNode; error?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const prefix = AREAS[area].prefix;
  const [state, formAction, pending] = useActionState<LoginState, FormData>(passwordLogin.bind(null, area), null);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [codeClosedAt, setCodeClosedAt] = useState<number | undefined>(undefined);
  const [email, setEmail] = useState("");
  // Messages: from the last login try, else ?error=… from a link or the "login kept?" check
  const [note, setNote] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const text = (k: string) => (t.has(k) ? t(k) : t("loginFailed"));
  const msg = note ?? (state?.error ? { tone: state.error === "awaiting_approval" ? "ok" as const : "error" as const, text: text(state.error) }
    : error ? { tone: error === "awaiting_approval" ? "ok" as const : "error" as const, text: text(error) } : null);
  const showCode = state?.code === "confirm" && state.at !== codeClosedAt;

  // After the email code (signed up but never confirmed): finish like any other login.
  async function finishAfterCode() {
    const r = await afterLogin(area);
    if (r.next) { router.replace(r.next); return; }
    if (!r.ok) { setCodeClosedAt(state?.at); setNote({ tone: r.error === "awaiting_approval" ? "ok" : "error", text: text(r.error ?? "wrongApp") }); return; }
    router.replace(r.mustChangePassword ? `${prefix}/reset-password?first=1` : prefix);
    router.refresh();
  }

  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/api/auth/confirm?next=${encodeURIComponent(prefix + "/reset-password")}`,
    });
    setNote({ tone: "ok", text: t("resetSent") });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <AuthHeader />
      {showCode ? (
        <div className="card"><CodeForm email={state?.email ?? ""} type="signup" onVerified={finishAfterCode} onBack={() => setCodeClosedAt(state?.at)} /></div>
      ) : (
      <div className="card">
        <h1 className="mb-4 text-2xl font-bold">{mode === "login" ? title : t("forgotTitle")}</h1>
        {mode === "login" ? (
          <form action={formAction} onSubmit={() => setNote(null)} className="grid gap-3">
            <label><span className="label">{t("email")}</span>
              <input name="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label><span className="label">{t("password")}</span>
              <input name="password" className="input" type="password" autoComplete="current-password" required /></label>
            {msg && <p className={`rounded-lg p-3 text-sm ${msg.tone === "error" ? "bg-st-problem/10 text-st-problem" : "bg-st-ok/10 text-st-ok"}`}>{msg.text}</p>}
            <button className="btn-primary" disabled={pending}>{pending ? "…" : t("login")}</button>
          </form>
        ) : (
          <form onSubmit={forgot} className="grid gap-3">
            <label><span className="label">{t("email")}</span>
              <input name="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {note && <p className={`rounded-lg p-3 text-sm ${note.tone === "error" ? "bg-st-problem/10 text-st-problem" : "bg-st-ok/10 text-st-ok"}`}>{note.text}</p>}
            <button className="btn-primary">{t("sendResetLink")}</button>
          </form>
        )}
        <button className="mt-3 text-sm font-semibold text-sunny" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setNote(null); }}>
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
