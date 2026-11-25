"use client";
import { useLocale, useTranslations } from "next-intl";
import { localName } from "@/lib/format";

export type CatalogItem = {
  id: string; sku: string; name: string; name_zh_hans?: string | null; name_zh_hant?: string | null; name_tl?: string | null;
  description?: string | null; description_zh_hans?: string | null; description_zh_hant?: string | null; description_tl?: string | null;
  category_id: string | null; category: string | null; category_zh_hans?: string | null; category_zh_hant?: string | null; category_tl?: string | null;
  category_sort?: number; photo_url: string | null; unit: string; pack_weight_g: number | null; storage: string;
  price: number | null; regular_price: number | null; stock_badge: string | null; stock_qty?: number | null;
};

export function useName() {
  const locale = useLocale();
  return (row: object | null | undefined, base = "name") => localName(row as Record<string, unknown>, locale, base);
}

/** Product photo so customers and workers recognise it without reading (Spec 5). */
export function ProductPhoto({ url, className = "h-full w-full" }: { url: string | null | undefined; className?: string }) {
  if (!url) return <div className={`flex items-center justify-center bg-cream text-4xl ${className}`}>🥩</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" loading="lazy" className={`object-cover ${className}`} />;
}

export function packLabel(p: { unit: string; pack_weight_g: number | null }, t: (k: string) => string) {
  const unit = t(`unit_${p.unit}`);
  return p.pack_weight_g ? `${unit} · ${Number(p.pack_weight_g)} g` : unit;
}

const STEPS = ["new", "confirmed", "packing", "out_for_delivery", "delivered"] as const;
const STEP_OF: Record<string, number> = { new: 0, confirmed: 1, packing: 2, packed: 2, out_for_delivery: 3, delivered: 4, completed: 4 };

/** Status tracker: Received → Confirmed → Packing → Out for Delivery → Delivered (Spec 7.10). */
export function StatusTracker({ status, pickup }: { status: string; pickup?: boolean }) {
  const t = useTranslations("portal.tracker");
  if (status === "cancelled") return <div className="rounded-xl bg-st-problem/10 p-3 font-bold text-st-problem">{t("cancelled")}</div>;
  const at = STEP_OF[status] ?? 0;
  return (
    <ol className="flex items-start gap-1">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col items-center text-center">
          <div className="flex w-full items-center">
            <div className={`h-1 flex-1 ${i === 0 ? "invisible" : i <= at ? "bg-st-ok" : "bg-brown/15"}`} />
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i <= at ? "bg-st-ok text-white" : "bg-brown/10 text-brown/50"}`}>
              {i < at ? "✓" : i + 1}
            </div>
            <div className={`h-1 flex-1 ${i === STEPS.length - 1 ? "invisible" : i < at ? "bg-st-ok" : "bg-brown/15"}`} />
          </div>
          <span className={`mt-1 text-[11px] font-semibold leading-tight sm:text-xs ${i === at ? "text-brown" : "text-brown/50"}`}>
            {pickup && s === "out_for_delivery" ? t("ready") : t(s)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function OfflineNote() {
  const t = useTranslations("portal");
  return <div className="mb-3 rounded-xl bg-gold/20 p-3 text-sm font-semibold">📴 {t("offlineNote")}</div>;
}
