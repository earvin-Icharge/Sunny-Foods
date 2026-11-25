// Display helpers. All dates shown in Philippine time.
const TZ = "Asia/Manila";

export function peso(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  return "₱" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function qty(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toLocaleString("en-PH", { maximumFractionDigits: 3 });
}

const LOCALE_MAP: Record<string, string> = { en: "en-PH", "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", tl: "fil-PH" };

export function date(d: string | Date | null | undefined, locale = "en"): string {
  if (!d) return "—";
  const v = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00+08:00" : d) : d;
  return v.toLocaleDateString(LOCALE_MAP[locale] ?? "en-PH", { timeZone: TZ, year: "numeric", month: "short", day: "numeric" });
}

export function dateTime(d: string | Date | null | undefined, locale = "en"): string {
  if (!d) return "—";
  const v = typeof d === "string" ? new Date(d) : d;
  return v.toLocaleString(LOCALE_MAP[locale] ?? "en-PH", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function todayManila(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Pick the product/category name in the user's language (fallback English). */
export function localName(row: Record<string, unknown> | null | undefined, locale: string, base = "name"): string {
  if (!row) return "";
  const key = locale === "zh-Hans" ? `${base}_zh_hans` : locale === "zh-Hant" ? `${base}_zh_hant` : locale === "tl" ? `${base}_tl` : base;
  return String((row[key] as string) || (row[base] as string) || "");
}
