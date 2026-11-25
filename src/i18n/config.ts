export const LOCALES = ["en", "zh-Hans", "zh-Hant", "tl"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_LABELS: Record<Locale, string> = { en: "English", "zh-Hans": "简体中文", "zh-Hant": "繁體中文", tl: "Tagalog" };
export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}
