"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabaseBrowser } from "@/lib/supabase/client";
import { afterLogin } from "@/app/actions/auth";
import { AREAS, type Area } from "@/lib/areas";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

/** Email + password login (decision D1). */
export function LoginForm({ area, title, footer }: { area: Area; title: string; footer?: React.ReactNode }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const prefix = AREAS[area].prefix;
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setBusy(false); setMsg({ tone: "error", text: t(error.message.includes("confirm") ? "emailNotConfirmed" : "wrongPassword") }); return; }
    const r = await afterLogin(area);
    setBusy(false);
    if (!r.ok) { setMsg({ tone: "error", text: t(r.error ?? "wrongApp") }); return; }
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
      <div className="flex items-center justify-between">
        <Image src="/logo.png" alt="Sunny Foods" width={160} height={80} priority />
        <LanguageSwitcher />
      </div>
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
      </div>
      {footer}
      <p className="text-center text-xs text-brown/60">
        <Link href={`${prefix}/privacy`} className="underline">{t("privacy")}</Link> · <Link href={`${prefix}/terms`} className="underline">{t("terms")}</Link>
      </p>
    </main>
  );
}
