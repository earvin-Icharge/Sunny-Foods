"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/portal-client";
import { afterLogin } from "@/app/actions/auth";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { PhotoInput } from "@/components/ui/PhotoInput";

/**
 * Business details, once, after a new customer's first login (Google, Facebook, phone or
 * email code — decision D1, 2026-11-26). Status stays Pending until Sunny Foods approves (Spec 7.10).
 */
export function WelcomeForm({ name, email, phone, refCode }: { name?: string; email?: string; phone?: string; refCode?: string }) {
  const t = useTranslations("portal.signup");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  return (
    <main className="mx-auto max-w-xl p-4 pb-16 sm:p-6">
      <div className="mb-4"><AuthHeader /></div>
      <form className="card grid gap-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErrors([]);
        const fd = new FormData(e.currentTarget);
        const r = await api<{ ok: boolean; errors?: string[] }>("/api/portal/onboard", { method: "POST", body: fd });
        if (r.ok) {
          const a = await afterLogin("portal");
          router.replace(a.ok ? "/portal" : "/portal/login");
          router.refresh();
          return;
        }
        setBusy(false);
        const errs = (r.data as { errors?: string[] } | undefined)?.errors;
        if (errs?.includes("login_again")) { router.replace("/portal/login"); return; }
        setErrors(errs?.length ? errs : [r.error === "offline" ? "offline" : "signup_failed"]);
      }}>
        <h1 className="text-2xl font-bold">{t("welcomeTitle")}</h1>
        <p className="text-sm text-brown/70">{t("welcomeIntro")}</p>
        {/* honeypot: hidden from people, bots fill it */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <label><span className="label">{t("businessName")} *</span><input name="business_name" required className="input" /></label>
        <label><span className="label">{t("businessType")}</span>
          <select name="business_type" className="input" defaultValue="restaurant">
            {["restaurant", "cafe", "retailer", "distributor", "private_label", "other"].map((b) => <option key={b} value={b}>{t(`type_${b}`)}</option>)}
          </select></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="label">{t("contactPerson")} *</span><input name="contact_person" required defaultValue={name ?? ""} className="input" autoComplete="name" /></label>
          <label><span className="label">{t("phone")} *</span><input name="phone" required defaultValue={phone ?? ""} readOnly={Boolean(phone)} className="input" type="tel" autoComplete="tel" /></label>
          {email
            ? <div><span className="label">{t("email")}</span><div className="input flex items-center bg-cream-light">{email}</div></div>
            : <label><span className="label">{t("emailOptional")}</span><input name="email" className="input" type="email" autoComplete="email" /></label>}
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
      </form>
    </main>
  );
}
