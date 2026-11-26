"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { teamSignup } from "@/app/actions/signup";
import { afterLogin } from "@/app/actions/auth";
import { AREAS } from "@/lib/areas";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { CodeForm } from "./CodeForm";

/**
 * Staff / agent self sign-up (decision D1, 2026-11-26):
 * 1) details  2) 6-digit email code  3) "waiting for the boss" screen.
 */
export function TeamSignupForm({ area }: { area: "internal" | "agent" }) {
  const t = useTranslations("auth");
  const prefix = AREAS[area].prefix;
  const [step, setStep] = useState<"form" | "code" | "waiting">("form");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <AuthHeader />
      {step === "waiting" ? (
        <div className="card text-center">
          <div className="text-5xl">⏳</div>
          <h1 className="mt-2 text-2xl font-bold">{t("waitingTitle")}</h1>
          <p className="mt-2 text-brown/80">{t("waitingText")}</p>
          <Link href={`${prefix}/login`} className="btn-primary mt-4 w-full">{t("backToLogin")}</Link>
        </div>
      ) : step === "code" ? (
        <div className="card">
          <CodeForm email={email} type="signup" onVerified={async () => {
            const r = await afterLogin(area);
            if (r.ok) { location.href = prefix; return; }
            setStep("waiting");
          }} />
        </div>
      ) : (
        <form className="card grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setErrors([]);
          const fd = new FormData(e.currentTarget);
          const r = await teamSignup(area, fd).catch(() => ({ ok: false, errors: ["signup_failed"] }));
          setBusy(false);
          if (!r.ok) { setErrors(r.errors?.length ? r.errors : ["signup_failed"]); return; }
          setEmail(String(fd.get("email") ?? "").trim().toLowerCase());
          setStep("code");
        }}>
          <h1 className="text-2xl font-bold">{t(area === "agent" ? "agentSignupTitle" : "staffSignupTitle")}</h1>
          <p className="text-sm text-brown/70">{t("teamSignupIntro")}</p>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <label><span className="label">{t("fullName")} *</span><input name="full_name" required className="input" autoComplete="name" /></label>
          <label><span className="label">{t("email")} *</span><input name="email" type="email" required className="input" autoComplete="email" /></label>
          <label><span className="label">{t("phone")} *</span><input name="phone" type="tel" required className="input" autoComplete="tel" /></label>
          <label><span className="label">{t("password")} *</span><input name="password" type="password" minLength={8} required className="input" autoComplete="new-password" />
            <span className="mt-1 block text-xs text-brown/60">{t("passwordTooShort")}</span></label>
          {area === "agent" ? (
            <label><span className="label">{t("agentType")}</span>
              <select name="agent_type" className="input" defaultValue="agent">
                <option value="agent">{t("agentType_agent")}</option>
                <option value="broker">{t("agentType_broker")}</option>
              </select></label>
          ) : (
            <label><span className="label">{t("staffJob")}</span><input name="note" className="input" placeholder={t("staffJobHint")} /></label>
          )}
          <label className="flex items-start gap-3 rounded-xl bg-cream-light p-3">
            <input type="checkbox" name="consent" required className="mt-1 h-5 w-5" />
            <span className="text-sm">{t.rich("consent", { link: (c) => <Link href={`${prefix}/privacy`} target="_blank" className="font-semibold text-sunny underline">{c}</Link> })}</span>
          </label>
          {errors.length > 0 && <ul className="rounded-lg bg-st-problem/10 p-3 text-sm text-st-problem">
            {errors.map((e) => <li key={e}>• {t.has(`signupErrors.${e}`) ? t(`signupErrors.${e}`) : t("signupErrors.signup_failed")}</li>)}</ul>}
          <button className="btn-primary" disabled={busy}>{busy ? "…" : t("signUp")}</button>
          <p className="text-center text-sm">{t("haveAccount")} <Link href={`${prefix}/login`} className="font-semibold text-sunny">{t("login")}</Link></p>
        </form>
      )}
    </main>
  );
}
