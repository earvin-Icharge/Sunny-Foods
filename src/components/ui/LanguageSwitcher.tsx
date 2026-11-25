"use client";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { setLanguage } from "@/app/actions/common";

/** One-tap language switcher (Spec 4). */
export function LanguageSwitcher({ dark }: { dark?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select aria-label="Language" value={locale} disabled={pending}
      onChange={(e) => start(async () => { await setLanguage(e.target.value); router.refresh(); })}
      className={`min-h-10 rounded-lg border px-2 text-sm font-semibold ${dark ? "border-white/20 bg-charcoal text-white" : "border-brown/20 bg-white text-brown"}`}>
      {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}
    </select>
  );
}
