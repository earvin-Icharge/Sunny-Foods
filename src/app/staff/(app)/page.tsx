import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireArea } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { date, peso, qty } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui/PageHeader";
import { PushOptIn } from "@/components/shell/PushOptIn";

export const metadata = { title: "Home" };

type Dash = {
  driver: boolean; to_pack: number | null; new_orders: number | null; to_deliver: number | null; unpaid_amount: number | null; today_sales: number | null;
  low_stock: { type: string; id: string; name: string; qty: number | null; level: number }[] | null;
  expiring: { batch_id: string; batch_no: string; product: string; expiry_date: string; qty: number | null; location: string }[] | null;
  overdue: { order_id: string; order_no: string; customer: string; due_date: string; balance: number | null }[] | null;
  pending_customers: number | null; pending_proofs: number | null; pending_deletes: number | null; flagged_discounts: number | null;
};

// Home dashboard (Spec 7.1): everything on one screen.
export default async function Dashboard() {
  const user = await requireArea("internal");
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const d = await readAs(user, async (tx) => {
    const [r] = await tx`select app.dashboard() as d`;
    return r.d as Dash;
  });
  // Driver = may see only their own deliveries (decided in the database; staff with no deliveries right are not drivers)
  const isDriver = d.driver;
  const approvals = [
    d.pending_customers ? { n: d.pending_customers, label: t("pendingCustomers"), href: "/staff/customers?status=pending" } : null,
    d.pending_proofs ? { n: d.pending_proofs, label: t("pendingProofs"), href: "/staff/payments" } : null,
    d.pending_deletes ? { n: d.pending_deletes, label: t("pendingDeletes"), href: "/staff/delete-requests" } : null,
    d.flagged_discounts ? { n: d.flagged_discounts, label: t("flaggedDiscounts"), href: "/staff/orders?flagged=1" } : null,
  ].filter(Boolean) as { n: number; label: string; href: string }[];

  return (
    <>
      <PageHeader title={t("hello", { name: user.fullName.split(" ")[0] || user.roleName })} subtitle={date(new Date(), locale)} actions={<PushOptIn />} />
      {isDriver ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label={t("myDeliveries")} value={d.to_deliver ?? 0} href="/staff/deliveries" tone={d.to_deliver ? "orange" : undefined} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Staff (Home = View): orders to pack + stock alerts only. Boss / Admin: full overview + money stats. */}
          {d.new_orders !== null && <Stat label={t("newOrders")} value={d.new_orders} href="/staff/orders?status=new" tone={d.new_orders ? "orange" : undefined} />}
          {d.to_pack !== null && <Stat label={t("toPack")} value={d.to_pack} href="/staff/packing" tone={d.to_pack ? "orange" : undefined} />}
          {d.to_deliver !== null && <Stat label={t("toDeliver")} value={d.to_deliver} href="/staff/deliveries" />}
          {d.unpaid_amount !== null && <Stat label={t("unpaid")} value={peso(d.unpaid_amount)} tone={d.unpaid_amount ? "red" : "green"} href="/staff/payments" />}
          {d.today_sales !== null && <Stat label={t("todaySales")} value={peso(d.today_sales)} tone="green" href="/staff/reports" />}
        </div>
      )}

      {approvals.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">{t("approvals")}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {approvals.map((a) => (
              <Link key={a.href} href={a.href} className="card flex items-center justify-between hover:ring-sunny/40">
                <span className="font-semibold">{a.label}</span>
                <span className="rounded-full bg-sunny px-3 py-1 font-bold text-white">{a.n}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {d.low_stock !== null && (
          <section className="card">
            <h2 className="mb-2 text-lg font-bold">⚠️ {t("lowStock")}</h2>
            {d.low_stock.length === 0 ? <p className="text-sm text-brown/60">{t("allGood")}</p> : (
              <ul className="grid gap-1 text-sm">
                {d.low_stock.map((l) => (
                  <li key={l.type + l.id} className="flex justify-between gap-2">
                    <Link href={l.type === "product" ? `/staff/products/${l.id}` : "/staff/products/materials"} className="font-semibold">
                      {l.type === "material" ? "📦 " : "🥩 "}{l.name}
                    </Link>
                    <span className="text-st-problem">{l.qty !== null ? `${qty(l.qty)} / ${qty(l.level)}` : t("low")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {d.expiring !== null && (
          <section className="card">
            <h2 className="mb-2 text-lg font-bold">⏳ {t("expiring")}</h2>
            {d.expiring.length === 0 ? <p className="text-sm text-brown/60">{t("allGood")}</p> : (
              <ul className="grid gap-1 text-sm">
                {d.expiring.map((b) => (
                  <li key={b.batch_id} className="flex justify-between gap-2">
                    <span><b>{b.product}</b> · {b.batch_no} · {b.location}</span>
                    <span className="text-st-packing">{date(b.expiry_date, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/staff/inventory/batches" className="mt-2 inline-block text-sm font-semibold text-sunny">{t("seeBatches")} →</Link>
          </section>
        )}
        {d.overdue !== null && (
          <section className="card">
            <h2 className="mb-2 text-lg font-bold">🔴 {t("overdue")}</h2>
            {d.overdue.length === 0 ? <p className="text-sm text-brown/60">{t("allGood")}</p> : (
              <ul className="grid gap-1 text-sm">
                {d.overdue.map((o) => (
                  <li key={o.order_id} className="flex justify-between gap-2">
                    <Link href={`/staff/orders/${o.order_id}`}><b>{o.order_no}</b> · {o.customer}</Link>
                    <span className="text-st-problem">{o.balance !== null ? peso(o.balance) : date(o.due_date, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  );
}
