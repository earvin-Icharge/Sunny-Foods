import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { date, localName, todayManila } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { DeliveryCard, type DeliveryRow } from "./DeliveryCard";

export const metadata = { title: "Deliveries" };

function windowStart(w: unknown): number {
  const m = String(w ?? "").match(/(\d{1,2}):?(\d{2})?/);
  if (!m) return 9999;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

/** Drivers: own deliveries for today. Office: all deliveries by date, assign driver, dispatch (Spec 7.7). */
export default async function DeliveriesPage({ searchParams }: PageProps<"/staff/deliveries">) {
  const user = await requirePerm("internal", "deliveries");
  const t = await getTranslations("deliveries");
  const locale = await getLocale();
  const sp = await searchParams;
  const isDriver = user.perms.modules.deliveries?.scope !== "all";
  const day = typeof sp.date === "string" && sp.date ? sp.date : todayManila();
  const focus = typeof sp.order === "string" ? sp.order : "";
  const { rows, items, drivers } = await readAs(user, async (tx) => {
    const rows = isDriver
      ? await tx`select * from app.v_orders where deleted_at is null and driver_id = ${user.id}
          and (status in ('packed','out_for_delivery') or (status in ('delivered','completed') and (delivered_at at time zone 'Asia/Manila')::date = ${day}::date))`
      : await tx`select * from app.v_orders where deleted_at is null and (
            id = nullif(${focus}, '')::uuid
            or (status in ('confirmed','packing','packed','out_for_delivery') and (coalesce(scheduled_date, delivery_date) is null or coalesce(scheduled_date, delivery_date) <= ${day}::date))
            or (status in ('delivered','completed') and (delivered_at at time zone 'Asia/Manila')::date = ${day}::date))`;
    const ids = rows.map((r) => String(r.id));
    const items = ids.length ? await tx`select order_id, product_name, name_zh_hans, name_zh_hant, name_tl, qty, unit
      from app.v_order_items where order_id = any(${ids}::uuid[]) and deleted_at is null order by sort` : [];
    const drivers = !isDriver && can(user.perms, "deliveries", 3)
      ? await tx`select id, full_name from app.profiles where role_key = 'driver' and active and deleted_at is null order by full_name` : [];
    return { rows, items, drivers };
  });
  const showMoney = fieldOn(user.perms, "price") || fieldOn(user.perms, "payment_details");
  const order = { new: 0, confirmed: 1, packing: 1, packed: 2, out_for_delivery: 0, delivered: 3, completed: 3 } as Record<string, number>;
  const list: DeliveryRow[] = rows
    .map((o) => ({
      id: String(o.id), orderNo: String(o.order_no), customer: String(o.customer_name), contact: (o.contact_person as string) ?? null,
      phone: (o.customer_phone as string) ?? null, address: (o.delivery_address as string) ?? null,
      lat: o.lat !== null ? Number(o.lat) : null, lng: o.lng !== null ? Number(o.lng) : null,
      status: String(o.status), method: String(o.delivery_method), courier: (o.courier_name as string) ?? null,
      date: date((o.scheduled_date ?? o.delivery_date) as string, locale), timeWindow: (o.time_window as string) ?? null,
      payment: String(o.payment_method), paymentStatus: String(o.payment_status),
      balance: showMoney && o.total !== null ? Math.max(0, Number(o.total) - Number(o.paid_amount ?? 0)) : null,
      driverId: (o.driver_id as string) ?? null, driverName: (o.driver_name as string) ?? null, notes: (o.notes as string) ?? null,
      scheduled: o.scheduled_date ? new Date(o.scheduled_date as string).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : day,
      items: items.filter((i) => i.order_id === o.id).map((i) => `${localName(i, locale) || String(i.product_name)} × ${Number(i.qty)} ${String(i.unit)}`),
      focus: String(o.id) === focus,
    }))
    .sort((a, b) => Number(b.focus) - Number(a.focus) || (order[a.status] ?? 9) - (order[b.status] ?? 9) || windowStart(a.timeWindow) - windowStart(b.timeWindow));
  return (
    <>
      <PageHeader title={isDriver ? t("myDeliveries") : t("title")} subtitle={isDriver ? t("driverHelp") : undefined} />
      {!isDriver && (
        <form className="no-print mb-4 flex gap-2">
          <input className="input max-w-xs" type="date" name="date" defaultValue={day} />
          <button className="btn-secondary">{t("show")}</button>
        </form>
      )}
      {list.length === 0 ? <Empty>{t("none")}</Empty> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((d) => (
            <DeliveryCard key={d.id} d={d} isDriver={isDriver} canAct={can(user.perms, "deliveries", 3)} canOpenOrder={can(user.perms, "orders")}
              drivers={drivers.map((x) => ({ id: String(x.id), name: String(x.full_name) }))} />
          ))}
        </div>
      )}
    </>
  );
}
