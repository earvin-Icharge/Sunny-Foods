"use client";
import { useTranslations } from "next-intl";
import { peso } from "@/lib/format";

/** Shows order errors from the database in plain words. */
export function ErrorList({ errors }: { errors: { code: string; [k: string]: unknown }[] }) {
  const t = useTranslations("orders");
  if (!errors.length) return null;
  return (
    <div className="rounded-xl bg-st-problem/10 p-4 text-st-problem">
      <b>{t("fixThese")}</b>
      <ul className="mt-1 list-disc pl-5">
        {errors.map((e, i) => {
          const code = e.code.startsWith("voucher_") ? `voucherReason.${e.code.slice(8)}` : `errors.${e.code}`;
          return <li key={i}>{t(code, {
            name: String(e.name ?? ""), min: peso(Number(e.min_order ?? 0)), limit: String(e.limit ?? ""),
            remaining: String(e.remaining ?? ""),
          })}</li>;
        })}
      </ul>
    </div>
  );
}
