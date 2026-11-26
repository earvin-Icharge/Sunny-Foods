"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * "Enter the 6-digit code" step, shared by every sign-up / login that sends a code:
 * - type "signup": staff/agent email confirmation
 * - type "email":  customer email login (no password)
 * - type "sms":    customer phone login
 */
export function CodeForm({ email, phone, type, onVerified, onBack }: {
  email?: string; phone?: string; type: "signup" | "email" | "sms";
  onVerified: () => void | Promise<void>; onBack?: () => void;
}) {
  const t = useTranslations("auth");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const sb = supabaseBrowser();

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const token = code.replace(/\D/g, "");
    const { error } = type === "sms"
      ? await sb.auth.verifyOtp({ phone: phone ?? "", token, type: "sms" })
      : await sb.auth.verifyOtp({ email: email ?? "", token, type });
    if (error) { setBusy(false); setMsg({ tone: "error", text: t("wrongCode") }); return; }
    await onVerified();
    setBusy(false);
  }

  async function resend() {
    setMsg(null);
    const { error } = type === "signup" ? await sb.auth.resend({ type: "signup", email: email ?? "" })
      : type === "sms" ? await sb.auth.signInWithOtp({ phone: phone ?? "" })
      : await sb.auth.signInWithOtp({ email: email ?? "" });
    setMsg(error ? { tone: "error", text: t(error.status === 429 ? "tooManyCodes" : "codeNotSent") } : { tone: "ok", text: t("codeResent") });
  }

  return (
    <form onSubmit={verify} className="grid gap-3">
      <h1 className="text-2xl font-bold">{t("enterCode")}</h1>
      <p className="text-sm text-brown/80">{t("codeSentTo", { to: (type === "sms" ? phone : email) ?? "" })}</p>
      <input className="input text-center font-mono text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code"
        maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label={t("enterCode")} />
      {msg && <p className={`rounded-lg p-3 text-sm ${msg.tone === "error" ? "bg-st-problem/10 text-st-problem" : "bg-st-ok/10 text-st-ok"}`}>{msg.text}</p>}
      <button className="btn-primary" disabled={busy || code.length < 6}>{busy ? "…" : t("confirm")}</button>
      <div className="flex justify-between text-sm font-semibold text-sunny">
        {onBack ? <button type="button" onClick={onBack}>← {t("back")}</button> : <span />}
        <button type="button" onClick={resend}>{t("resendCode")}</button>
      </div>
    </form>
  );
}
