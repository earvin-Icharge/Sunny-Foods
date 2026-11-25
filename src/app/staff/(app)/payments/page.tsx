import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { date, dateTime, peso } from "@/lib/format";
import { fileUrl } from "@/lib/storage";
import { PageHeader, Empty, Stat } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProofReview } from "./ProofReview";
import { RecordPaymentForm } from "../orders/RecordPaymentForm";

export const metadata = { title: "Payments" };

const TABS = ["open", "overdue", "unpaid", "partial"];

export default async function PaymentsPage({ searchParams }: PageProps<"/staff/payments">) {
  const user = await requirePerm("internal", "payments");
  const t = await getTranslations("payments");
  const ts = await getTranslations("status");
  const tb = await getTranslations("orderBreakdown");
  const locale = await getLocale();
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && TABS.includes(sp.tab) ? sp.tab : "open";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const showMoney = fieldOn(user.perms, "price") || fieldOn(user.perms, "payment_details");
  const canReview = can(user.perms, "payments", 3);
  const data = await readAs(user, async (tx) => {
    const orders = await tx`select id, order_no, customer_id, customer_name, status, payment_method, payment_status, due_date, total, paid_amount, delivered_at
      from app.v_orders where deleted_at is null and status <> 'cancelled' and payment_status <> 'paid'
        and (${tab} = 'open' or payment_status = ${tab})
        and (${q} = '' or order_no ilike ${"%" + q + "%"} or customer_name ilike ${"%" + q + "%"})
      order by case payment_status when 'overdue' then 0 else 1 end, due_date nulls last, created_at limit 300`;
    const proofs = canReview ? await tx`select pp.id, pp.customer_id, pp.order_id, pp.amount, pp.method, pp.reference, pp.file_path, pp.created_at,
        c.name as customer_name, o.order_no
      from app.payment_proofs pp join app.customers c on c.id = pp.customer_id left join app.orders o on o.id = pp.order_id
      where pp.status = 'pending' and pp.deleted_at is null order by pp.created_at` : [];
    const custIds = [...new Set(proofs.map((p) => String(p.customer_id)))];
    const openOrders = custIds.length ? await tx`select id, order_no, customer_id, total, paid_amount from app.v_orders
      where customer_id = any(${custIds}::uuid[]) and deleted_at is null and status <> 'cancelled' and payment_status <> 'paid' order by created_at` : [];
    const [sum] = await tx`select coalesce(sum(total - paid_amount) filter (where payment_status = 'overdue'), 0) as overdue,
      coalesce(sum(total - paid_amount), 0) as open, count(*) filter (where payment_status = 'overdue')::int as n_overdue
      from app.v_orders where deleted_at is null and status <> 'cancelled' and payment_status <> 'paid'`;
    return { orders, proofs, openOrders, sum };
  });
  const proofUrls = await Promise.all(data.proofs.map((p) => fileUrl(p.file_path as string)));
  return (
    <>
      <PageHeader title={t("title")} />
      {showMoney && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label={t("openBalance")} value={peso(data.sum.open as number)} />
          <Stat label={t("overdueBalance")} value={peso(data.sum.overdue as number)} tone="red" />
          <Stat label={t("overdueOrders")} value={String(data.sum.n_overdue)} tone="red" />
        </div>
      )}

      {canReview && (
        <section className="mb-6">
          <h2 className="mb-3 text-xl font-bold">{t("proofsToCheck")} ({data.proofs.length})</h2>
          {data.proofs.length === 0 ? <Empty>{t("noProofs")}</Empty> : (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.proofs.map((p, k) => (
                <ProofReview key={String(p.id)} proof={{
                  id: String(p.id), customer: String(p.customer_name), orderId: (p.order_id as string) ?? null, orderNo: (p.order_no as string) ?? null,
                  amount: Number(p.amount), method: String(p.method), reference: (p.reference as string) ?? null, url: proofUrls[k],
                  uploaded: dateTime(p.created_at as string, locale), isPdf: String(p.file_path).toLowerCase().endsWith(".pdf"),
                }} orders={data.openOrders.filter((o) => o.customer_id === p.customer_id).map((o) => ({
                  id: String(o.id), label: `${o.order_no}${o.total !== null ? ` · ${t("balance")} ${peso(Number(o.total) - Number(o.paid_amount ?? 0))}` : ""}`,
                }))} />
              ))}
            </div>
          )}
        </section>
      )}

      <h2 className="mb-3 text-xl font-bold">{t("unpaidOrders")}</h2>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        {TABS.map((k) => (
          <Link key={k} href={`/staff/payments?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? "bg-sunny text-white" : "bg-white ring-1 ring-brown/10"}`}>
            {k === "open" ? t("allOpen") : ts(k)}
          </Link>
        ))}
        <form className="ml-auto flex gap-2"><input type="hidden" name="tab" value={tab} />
          <input className="input min-h-10" name="q" defaultValue={q} placeholder={t("search")} /><button className="btn-secondary btn-sm">{t("search")}</button></form>
      </div>
      {data.orders.length === 0 ? <Empty>{t("allPaid")}</Empty> : (
        <div className="grid gap-2">
          {data.orders.map((o) => {
            const bal = o.total !== null ? Number(o.total) - Number(o.paid_amount ?? 0) : null;
            return (
              <details key={String(o.id)} className="card py-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <Link href={`/staff/orders/${o.id}`} className="font-bold text-sunny">{String(o.order_no)}</Link> · {String(o.customer_name)}
                    <div className="text-xs text-brown/60">{tb(String(o.payment_method))} · {ts(String(o.status))}{o.due_date ? ` · ${t("due")} ${date(o.due_date as string, locale)}` : ""}</div>
                  </div>
                  <StatusBadge kind="payment" status={String(o.payment_status)} />
                  {showMoney && bal !== null && <b className="tabular-nums">{peso(bal)}</b>}
                </summary>
                {can(user.perms, "payments", 2) && showMoney && <div className="mt-3 border-t border-brown/10 pt-3"><RecordPaymentForm orderId={String(o.id)} balance={bal} /></div>}
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
