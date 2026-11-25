import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { date, localName, qty } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LiveRefresh } from "../orders/LiveRefresh";

export const metadata = { title: "Packing" };

/** Orders waiting to be packed, oldest delivery date first (Spec 7.6). No prices here. */
export default async function PackingQueue() {
  const user = await requirePerm("internal", "packing");
  const t = await getTranslations("packing");
  const tb = await getTranslations("orderBreakdown");
  const locale = await getLocale();
  const { orders, items } = await readAs(user, async (tx) => {
    const orders = await tx`select id, order_no, customer_name, status, delivery_date, time_window, delivery_method
      from app.v_orders where deleted_at is null and status in ('confirmed','packing')
      order by case when status = 'packing' then 0 else 1 end, delivery_date nulls last, created_at`;
    const ids = orders.map((o) => String(o.id));
    const items = ids.length ? await tx`select order_id, product_name, name_zh_hans, name_zh_hant, name_tl, qty, unit, is_free
      from app.v_order_items where order_id = any(${ids}::uuid[]) and deleted_at is null order by sort` : [];
    return { orders, items };
  });
  return (
    <>
      <LiveRefresh userId={user.id} kinds={["new_order", "order_status"]} />
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {orders.length === 0 ? <Empty>{t("nothingToPack")}</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {orders.map((o, idx) => (
            <Link key={String(o.id)} href={`/staff/packing/${o.id}`} className={`card grid gap-2 hover:ring-sunny/40 ${idx === 0 ? "ring-2 ring-sunny/50" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <b className="text-lg">{String(o.order_no)}</b><StatusBadge status={String(o.status)} />
              </div>
              <div className="font-semibold">{String(o.customer_name)}</div>
              <div className="text-sm text-brown/70">📅 {date(o.delivery_date as string, locale)}{o.time_window ? ` · ${o.time_window}` : ""} · {tb(String(o.delivery_method))}</div>
              <ul className="text-sm">
                {items.filter((i) => i.order_id === o.id).map((i, k) => (
                  <li key={k}>• {localName(i, locale) || String(i.product_name)} × <b>{qty(i.qty as number)}</b> {String(i.unit)}{i.is_free ? ` (${tb("freeItem")})` : ""}</li>
                ))}
              </ul>
              <span className="btn-primary mt-1">{o.status === "packing" ? t("continue") : t("start")}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
