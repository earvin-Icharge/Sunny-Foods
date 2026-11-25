import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

// Screen text lives in /messages/<locale>/<section>.json (one file per section).
// Missing words fall back to English.
type Messages = Record<string, unknown>;
const cache = new Map<string, Messages>();

function readLocale(locale: string): Messages {
  if (process.env.NODE_ENV === "production" && cache.has(locale)) return cache.get(locale)!;
  const dir = path.join(process.cwd(), "messages", locale);
  const out: Messages = {};
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      out[file.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    }
  }
  cache.set(locale, out);
  return out;
}

function deepMerge(base: Messages, over: Messages): Messages {
  const res: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    res[k] = v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object"
      ? deepMerge(base[k] as Messages, v as Messages)
      : v;
  }
  return res;
}

export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale: Locale = isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
  const messages = locale === "en" ? readLocale("en") : deepMerge(readLocale("en"), readLocale(locale));
  return { locale, messages, timeZone: "Asia/Manila", onError: () => {}, getMessageFallback: ({ key }) => key };
});
