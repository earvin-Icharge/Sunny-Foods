"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { cachedGet } from "@/lib/portal-client";
import { date, peso } from "@/lib/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OfflineNote } from "./shared";

type Row = { id: string; order_no: string; status: string; delivery_date: string | null; time_window: string | null; payment_status: string; total: number; created_at: string };

/** My Orders: history with status and payment status (Spec 7.10). */
export function OrdersList() {
  const t = useTranslations("portal");
  const locale = useLocale();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    cachedGet<{ items: Row[] }>("/api/portal/orders", "orders").then((r) => {
      if (r.ok) { setRows(r.data.items); setOffline(Boolean(r.offline)); } else { setRows([]); setOffline(r.status === 0); }
    });
  }, []);
  if (rows === null) return <p className="py-10 text-center text-brown/60">{t("loading")}</p>;
  return (
    <div className="grid gap-3">
      {offline && <OfflineNote />}
      {rows.length === 0 && <div className="card py-10 text-center"><p>{t("noOrders")}</p><Link href="/portal" className="btn-primary mt-4">{t("startShopping")}</Link></div>}
      {rows.map((o) => (
        <Link key={o.id} href={`/portal/orders/${o.id}`} className="card flex flex-wrap items-center gap-3 hover:ring-sunny/40">
          <div className="min-w-0 flex-1">
            <div className="font-bold">{o.order_no}</div>
            <div className="text-sm text-brown/60">{t("ordered")} {date(o.created_at, locale)} · {t("delivery")} {date(o.delivery_date, locale)} {o.time_window ?? ""}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-bold">{peso(o.total)}</span>
            <div className="flex gap-1"><StatusBadge status={o.status} /><StatusBadge kind="payment" status={o.payment_status} /></div>
          </div>
        </Link>
      ))}
    </div>
  );
}
