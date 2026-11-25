import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { peso } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const metadata = { title: "Agents" };

/** Agents page — company monitoring (Spec 7.13). */
export default async function AgentsPage({ searchParams }: PageProps<"/staff/agents">) {
  const user = await requirePerm("internal", "agents");
  const t = await getTranslations("agents");
  const sp = await searchParams;
  const showAll = sp.all === "1";
  const rows = await readAs(user, (tx) => tx`
    with m as (select date_trunc('month', now() at time zone 'Asia/Manila') as start)
    select a.id, a.name, a.type, a.status, a.referral_code,
      (select coalesce(sum(o.commission_base), 0) from app.orders o, m where o.agent_id = a.id and o.deleted_at is null
        and o.status <> 'cancelled' and o.created_at at time zone 'Asia/Manila' >= m.start) as month_sales,
      coalesce(array_length(app.agent_customer_ids(a.id), 1), 0) as customers,
      (select coalesce(sum(amount), 0) from app.commissions c where c.agent_id = a.id and c.status in ('earned','approved')) as unpaid,
      (select coalesce(sum(amount), 0) from app.commissions c where c.agent_id = a.id and c.status = 'pending') as pending,
      (select coalesce(sum(amount), 0) from app.commissions c where c.agent_id = a.id and c.status = 'paid') as paid,
      (select coalesce(sum(amount), 0) from app.commissions c, m where c.agent_id = a.id and c.status in ('earned','approved','paid')
        and c.earned_at at time zone 'Asia/Manila' >= m.start) as earned_month
    from app.agents a where a.deleted_at is null and (${showAll} or a.status <> 'resigned' or a.portal_locked_at is null)
    order by month_sales desc, a.name`);
  const boss = can(user.perms, "agents", 5);
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<>
        <Link className="btn-secondary" href="/staff/agents/payouts">{t("payouts")}</Link>
        {fieldOn(user.perms, "commission_rates") && <Link className="btn-secondary" href="/staff/agents/rules">{t("rules")}</Link>}
        {boss && <Link className="btn-primary" href="/staff/agents/new">+ {t("add")}</Link>}
      </>} />
      <form className="mb-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="all" value="1" defaultChecked={showAll} /> {t("showLocked")}</label>
        <button className="btn-ghost btn-sm">{t("refresh")}</button></form>
      {rows.length === 0 ? <Empty>{t("none")}</Empty> : (
        <div className="table-wrap card p-0">
          <table className="table">
            <thead><tr>
              <th>#</th><th>{t("name")}</th><th>{t("status")}</th><th className="text-right">{t("monthSales")}</th>
              <th className="text-right">{t("activeCustomers")}</th><th className="text-right">{t("earnedMonth")}</th>
              <th className="text-right">{t("pending")}</th><th className="text-right">{t("unpaid")}</th><th className="text-right">{t("paid")}</th>
            </tr></thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={String(a.id)}>
                  <td>{i + 1}</td>
                  <td><Link className="font-bold text-sunny" href={`/staff/agents/${a.id}`}>{String(a.name)}</Link>
                    <div className="text-xs text-brown/60">{t(`type_${a.type}`)} · {String(a.referral_code)}</div></td>
                  <td><StatusBadge kind="generic" status={String(a.status)} /></td>
                  <td className="text-right">{peso(a.month_sales as number)}</td>
                  <td className="text-right">{String(a.customers)}</td>
                  <td className="text-right">{peso(a.earned_month as number)}</td>
                  <td className="text-right">{peso(a.pending as number)}</td>
                  <td className="text-right font-semibold">{peso(a.unpaid as number)}</td>
                  <td className="text-right">{peso(a.paid as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
