"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/lib/portal-client";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { PhotoInput } from "@/components/ui/PhotoInput";

/** Customer sign-up (Spec 7.10). Status stays Pending until Sunny Foods approves. */
export function SignupForm({ refCode }: { refCode?: string }) {
  const t = useTranslations("portal.signup");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  if (done) return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
      <Image src="/logo.png" alt="Sunny Foods" width={160} height={80} className="mx-auto" />
      <div className="card">
        <div className="text-5xl">📧</div>
        <h1 className="mt-2 text-2xl font-bold">{t("doneTitle")}</h1>
        <p className="mt-2 text-brown/80">{t("doneText")}</p>
        <Link href="/portal/login" className="btn-primary mt-4 w-full">{t("goLogin")}</Link>
      </div>
    </main>
  );

  return (
    <main className="mx-auto max-w-xl p-4 pb-16 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Image src="/logo.png" alt="Sunny Foods" width={140} height={70} priority />
        <LanguageSwitcher />
      </div>
      <form className="card grid gap-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErrors([]);
        const fd = new FormData(e.currentTarget);
        const r = await api<{ ok: boolean; errors?: string[] }>("/api/portal/signup", { method: "POST", body: fd });
        setBusy(false);
        if (r.ok) { setDone(true); return; }
        const errs = (r.data as { errors?: string[] } | undefined)?.errors;
        setErrors(errs?.length ? errs : [r.error === "offline" ? "offline" : "signup_failed"]);
      }}>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-brown/70">{t("intro")}</p>
        {/* honeypot: hidden from people, bots fill it */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <label><span className="label">{t("businessName")} *</span><input name="business_name" required className="input" /></label>
        <label><span className="label">{t("businessType")}</span>
          <select name="business_type" className="input" defaultValue="restaurant">
            {["restaurant", "cafe", "retailer", "distributor", "private_label", "other"].map((b) => <option key={b} value={b}>{t(`type_${b}`)}</option>)}
          </select></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="label">{t("contactPerson")} *</span><input name="contact_person" required className="input" autoComplete="name" /></label>
          <label><span className="label">{t("phone")} *</span><input name="phone" required className="input" type="tel" autoComplete="tel" /></label>
          <label><span className="label">{t("email")} *</span><input name="email" required className="input" type="email" autoComplete="email" /></label>
          <label><span className="label">{t("password")} *</span><input name="password" required minLength={8} className="input" type="password" autoComplete="new-password" />
            <span className="mt-1 block text-xs text-brown/60">{t("passwordHint")}</span></label>
        </div>
        <label><span className="label">{t("address")} *</span><textarea name="address" required rows={2} className="input py-3" autoComplete="street-address" /></label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary btn-sm" onClick={() => navigator.geolocation?.getCurrentPosition(
            (p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); }, () => setErrors(["location"]))}>
            📍 {t("useMyLocation")}</button>
          {lat && <a className="text-sm text-sunny underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${lat},${lng}`}>{t("pinSaved")}</a>}
          <input type="hidden" name="lat" value={lat} /><input type="hidden" name="lng" value={lng} />
        </div>
        <PhotoInput name="permit" label={t("permit")} accept="image/*,application/pdf" />
        <label><span className="label">{t("referral")}</span><input name="referral_code" defaultValue={refCode ?? ""} className="input font-mono uppercase" /></label>
        <label className="flex items-start gap-3 rounded-xl bg-cream-light p-3">
          <input type="checkbox" name="consent" required className="mt-1 h-5 w-5" />
          <span className="text-sm">{t.rich("consent", { link: (c) => <Link href="/portal/privacy" target="_blank" className="font-semibold text-sunny underline">{c}</Link> })}</span>
        </label>
        {errors.length > 0 && <ul className="rounded-lg bg-st-problem/10 p-3 text-sm text-st-problem">{errors.map((e) => <li key={e}>• {t.has(`errors.${e}`) ? t(`errors.${e}`) : t("errors.signup_failed")}</li>)}</ul>}
        <button className="btn-primary" disabled={busy}>{busy ? "…" : t("submit")}</button>
        <p className="text-center text-sm">{t("haveAccount")} <Link href="/portal/login" className="font-semibold text-sunny">{t("goLogin")}</Link></p>
      </form>
    </main>
  );
}
