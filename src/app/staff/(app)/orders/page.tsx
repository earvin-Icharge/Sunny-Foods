import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { date, peso } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LiveRefresh } from "./LiveRefresh";

export const metadata = { title: "Orders" };

const TABS = ["active", "new", "confirmed", "packing", "packed", "out_for_delivery", "delivered", "completed", "cancelled", "all"];

export default async function OrdersPage({ searchParams }: PageProps<"/staff/orders">) {
  const user = await requirePerm("internal", "orders");
  const t = await getTranslations("orders");
  const ts = await getTranslations("status");
  const locale = await getLocale();
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const status = s("status") || "active";
  const q = s("q");
  const day = s("date");
  const source = s("source");
  const flagged = s("flagged") === "1";
  const rows = await readAs(user, (tx) => tx`
    select id, order_no, customer_name, source, status, delivery_date, time_window, delivery_method, payment_status, total,
      manual_discount_flagged, driver_name, created_at
    from app.v_orders
    where deleted_at is null
      and (${status} = 'all' or (${status} = 'active' and status not in ('completed','cancelled')) or status = ${status})
      and (${q} = '' or order_no ilike ${"%" + q + "%"} or customer_name ilike ${"%" + q + "%"})
      and (${day} = '' or delivery_date = nullif(${day}, '')::date)
      and (${source} = '' or source = ${source})
      and (not ${flagged} or manual_discount_flagged)
    order by case when status = 'new' then 0 else 1 end, delivery_date nulls last, created_at desc
    limit 300`);
  const qs = (o: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(day && { date: day }), ...(source && { source }), ...(flagged && { flagged: "1" }), status, ...o });
    return `/staff/orders?${p.toString()}`;
  };
  const showMoney = fieldOn(user.perms, "price");
  return (
    <>
      <LiveRefresh userId={user.id} />
      <PageHeader title={t("title")} actions={can(user.perms, "orders", 2) && <Link className="btn-primary" href="/staff/orders/new">+ {t("newOrder")}</Link>} />
      <div className="no-print mb-3 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((k) => (
          <Link key={k} href={qs({ status: k })} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${status === k ? "bg-sunny text-white" : "bg-white ring-1 ring-brown/10"}`}>
            {k === "active" ? t("active") : k === "all" ? t("all") : ts(k)}
          </Link>
        ))}
      </div>
      <form className="no-print mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <input type="hidden" name="status" value={status} />
        <input className="input" name="q" defaultValue={q} placeholder={t("searchOrders")} />
        <input className="input" type="date" name="date" defaultValue={day} aria-label={t("deliveryDate")} />
        <select className="input" name="source" defaultValue={source}>
          <option value="">{t("allSources")}</option>
          <option value="portal">{t("source.portal")}</option><option value="agent">{t("source.agent")}</option><option value="staff">{t("source.staff")}</option>
        </select>
        {can(user.perms, "orders", 5) && <label className="flex items-center gap-2 whitespace-nowrap px-2 text-sm"><input type="checkbox" name="flagged" value="1" defaultChecked={flagged} /> {t("flaggedOnly")}</label>}
        <button className="btn-secondary">{t("filter")}</button>
      </form>
      {rows.length === 0 ? <Empty>{t("none")}</Empty> : (
        <div className="grid gap-2">
          {rows.map((o) => (
            <Link key={String(o.id)} href={`/staff/orders/${o.id}`} className={`card flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:ring-sunny/40 ${o.status === "new" ? "ring-2 ring-st-new/40" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{String(o.order_no)}</b>
                  <span className="rounded bg-cream px-2 text-xs font-semibold">{t(`source.${o.source}`)}</span>
                  {o.manual_discount_flagged ? <span className="rounded bg-gold/30 px-2 text-xs font-semibold">{t("flagged")}</span> : null}
                </div>
                <div className="truncate text-brown/80">{String(o.customer_name)}</div>
                <div className="text-xs text-brown/60">
                  {date(o.delivery_date as string, locale)}{o.time_window ? ` · ${o.time_window}` : ""}{o.driver_name ? ` · 🚚 ${o.driver_name}` : ""}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={String(o.status)} />
                <StatusBadge kind="payment" status={String(o.payment_status)} />
                {showMoney && <span className="font-bold">{peso(o.total as number)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
