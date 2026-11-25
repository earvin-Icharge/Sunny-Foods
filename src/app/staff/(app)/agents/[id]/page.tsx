import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { date, peso } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AuditHistory } from "@/components/ui/AuditHistory";
import { AgentForm } from "../AgentForm";
import { RulesEditor } from "../RulesEditor";
import { AdjustmentForm, CancelCommissionsForm, CreateLoginButton, LinkCustomerForm, ResignForm, TargetForm, TransferForm } from "./AgentTools";

const TABS = ["overview", "customers", "orders", "commissions", "payouts", "rules", "profile"] as const;

export default async function AgentPage({ params, searchParams }: PageProps<"/staff/agents/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab)) ? String(sp.tab) : "overview";
  const user = await requirePerm("internal", "agents");
  const t = await getTranslations("agents");
  const locale = await getLocale();
  const boss = can(user.perms, "agents", 5);
  const showRates = fieldOn(user.perms, "commission_rates");
  const d = await readAs(user, async (tx) => {
    const [a] = await tx`select a.*, p.email as login_email, p.active as login_active from app.agents a
      left join app.profiles p on p.id = a.profile_id where a.id = ${id} and a.deleted_at is null`;
    if (!a) return null;
    const links = await tx`select l.*, c.name as customer_name, c.status as customer_status from app.agent_customers l
      join app.customers c on c.id = l.customer_id where l.agent_id = ${id} and l.deleted_at is null order by (l.end_date is null) desc, l.start_date desc`;
    const current = await tx`select c.id, c.name from app.customers c where c.id = any(app.agent_customer_ids(${id}::uuid)) order by c.name`;
    const commissions = await tx`select cm.*, o.order_no, c.name as customer_name from app.commissions cm
      join app.orders o on o.id = cm.order_id join app.customers c on c.id = cm.customer_id
      where cm.agent_id = ${id} order by cm.created_at desc limit 300`;
    const adjustments = await tx`select * from app.commission_adjustments where agent_id = ${id} and deleted_at is null order by created_at desc`;
    const payouts = await tx`select * from app.commission_payouts where agent_id = ${id} and deleted_at is null order by period_end desc`;
    const targets = await tx`select * from app.agent_targets where agent_id = ${id} and deleted_at is null order by month desc limit 12`;
    const settlements = await tx`select id, status, last_working_day, created_at from app.agent_settlements where agent_id = ${id} and deleted_at is null order by created_at desc`;
    const [sum] = await tx`select
      (select coalesce(sum(o.commission_base), 0) from app.orders o where o.agent_id = ${id} and o.deleted_at is null and o.status <> 'cancelled'
        and date_trunc('month', o.created_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila')) as month_sales,
      (select coalesce(sum(amount), 0) from app.commissions where agent_id = ${id} and status = 'pending') as pending,
      (select coalesce(sum(amount), 0) from app.commissions where agent_id = ${id} and status in ('earned','approved')) as unpaid,
      (select coalesce(sum(amount), 0) from app.commissions where agent_id = ${id} and status = 'paid') as paid`;
    const orders = tab === "orders" ? await tx`select id, order_no, customer_name, status, payment_status, total, created_at from app.v_orders
      where deleted_at is null and (agent_id = ${id} or customer_id = any(app.agent_customer_ids(${id}::uuid))) order by created_at desc limit 200` : [];
    const allCustomers = boss ? await tx`select id, name from app.customers where deleted_at is null and status = 'approved' order by name` : [];
    const otherAgents = boss ? await tx`select id, name from app.agents where deleted_at is null and status = 'active' and id <> ${id} order by name` : [];
    const roles = await tx`select key, name from app.roles where is_agent_role and active and deleted_at is null order by sort`;
    const teams = await tx`select id, name from app.teams where deleted_at is null order by name`;
    const rules = showRates && tab === "rules" ? await tx`select r.*, p.name as product_name, c.name as category_name from app.commission_rules r
      left join app.products p on p.id = r.product_id left join app.categories c on c.id = r.category_id
      where r.agent_id = ${id} and r.deleted_at is null order by r.scope, r.min_monthly_sales nulls first` : [];
    const products = tab === "rules" ? await tx`select id, name from app.products where deleted_at is null order by name` : [];
    const categories = tab === "rules" ? await tx`select id, name from app.categories where deleted_at is null order by sort` : [];
    return { a, links, current, commissions, adjustments, payouts, targets, settlements, sum, orders, allCustomers, otherAgents, roles, teams, rules, products, categories };
  });
  if (!d) notFound();
  const { a } = d;
  const opts = (rows: Record<string, unknown>[]) => rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
  return (
    <>
      <PageHeader title={String(a.name)} subtitle={<>{t(`type_${a.type}`)} · {String(a.referral_code)} · <StatusBadge kind="generic" status={String(a.status)} /></>}
        back="/staff/agents" actions={boss && <>
          {a.profile_id ? <Link className="btn-secondary btn-sm" href={`/staff/settings/users/${a.profile_id}`}>{t("accessSettings")}</Link>
            : <CreateLoginButton agentId={id} />}
          {a.status !== "resigned" && <ResignForm agentId={id} agentName={String(a.name)} />}
        </>} />
      <nav className="no-print mb-4 flex gap-1 overflow-x-auto">
        {TABS.filter((x) => x !== "rules" || showRates).map((x) => (
          <Link key={x} href={`?tab=${x}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${tab === x ? "bg-sunny text-white" : "bg-white text-brown"}`}>{t(`tab_${x}`)}</Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("monthSales")} value={peso(d.sum.month_sales as number)} />
            <Stat label={t("pending")} value={peso(d.sum.pending as number)} tone="orange" />
            <Stat label={t("unpaid")} value={peso(d.sum.unpaid as number)} tone="red" />
            <Stat label={t("paid")} value={peso(d.sum.paid as number)} tone="green" />
          </div>
          {d.settlements.length > 0 && (
            <div className="card">
              <h2 className="mb-2 font-bold">{t("settlements")}</h2>
              {d.settlements.map((s) => (
                <Link key={String(s.id)} href={`/staff/agents/${id}/settlement/${s.id}`} className="flex items-center justify-between border-b border-brown/5 py-2">
                  <span>{t("lastDay")}: {date(s.last_working_day as string, locale)}</span><StatusBadge kind="generic" status={String(s.status)} />
                </Link>
              ))}
            </div>
          )}
          <div className="card">
            <h2 className="mb-2 font-bold">{t("targets")}</h2>
            <ul className="mb-3 grid gap-1 text-sm">
              {d.targets.map((x) => <li key={String(x.id)}>{String(x.month).slice(0, 7)}: <b>{peso(x.target_amount as number)}</b></li>)}
            </ul>
            {boss && <TargetForm agentId={id} />}
          </div>
          <div className="card text-sm">
            <div>{t("payoutMethod")}: {a.payout_method ? String(a.payout_method).toUpperCase() : "—"} · {String(a.payout_name ?? "—")}</div>
            <div>{t("login")}: {a.login_email ? `${a.login_email} (${a.login_active ? t("status_active") : t("status_inactive")})` : t("noLogin")}</div>
            {a.last_working_day ? <div>{t("lastDay")}: {date(a.last_working_day as string, locale)}</div> : null}
          </div>
        </div>
      )}

      {tab === "customers" && (
        <div className="grid gap-4">
          <div className="card table-wrap p-0">
            <table className="table">
              <thead><tr><th>{t("customer")}</th><th>{t("share")}</th><th>{t("from")}</th><th>{t("until")}</th><th>{t("source")}</th></tr></thead>
              <tbody>{d.links.map((l) => (
                <tr key={String(l.id)} className={l.end_date && String(l.end_date) < new Date().toISOString().slice(0, 10) ? "opacity-50" : ""}>
                  <td className="font-semibold">{String(l.customer_name)}</td><td>{String(l.share_pct)}%</td>
                  <td>{date(l.start_date as string, locale)}</td><td>{l.end_date ? date(l.end_date as string, locale) : "—"}</td>
                  <td>{t(`src_${l.source}`)}{l.note ? <div className="text-xs text-brown/60">{String(l.note)}</div> : null}</td>
                </tr>))}</tbody>
            </table>
          </div>
          {boss && <>
            <LinkCustomerForm agentId={id} customers={opts(d.allCustomers)} />
            {d.current.length > 0 && <TransferForm fromAgentId={id} customers={opts(d.current)} agents={opts(d.otherAgents)} />}
          </>}
        </div>
      )}

      {tab === "orders" && (
        <div className="card table-wrap p-0">
          <table className="table">
            <thead><tr><th>{t("order")}</th><th>{t("customer")}</th><th>{t("status")}</th><th>{t("payment")}</th><th className="text-right">{t("total")}</th></tr></thead>
            <tbody>{d.orders.map((o) => (
              <tr key={String(o.id)}>
                <td><Link className="font-semibold text-sunny" href={`/staff/orders/${o.id}`}>{String(o.order_no)}</Link><div className="text-xs">{date(o.created_at as string, locale)}</div></td>
                <td>{String(o.customer_name)}</td><td><StatusBadge status={String(o.status)} /></td>
                <td><StatusBadge kind="payment" status={String(o.payment_status)} /></td><td className="text-right">{peso(o.total as number)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}

      {tab === "commissions" && (
        <div className="grid gap-4">
          {boss ? (
            <CancelCommissionsForm agentId={id} agentName={String(a.name)} customers={opts(d.current)} showRates={showRates}
              lines={d.commissions.map((c) => ({ id: String(c.id), orderNo: String(c.order_no), customer: String(c.customer_name), date: date(c.created_at as string, locale),
                base: Number(c.base_amount), rate: Number(c.rate), share: Number(c.share_pct), amount: Number(c.amount), status: String(c.status),
                voidReason: (c.void_reason as string) ?? null, transferred: Boolean(c.transferred_from_agent_id) }))} />
          ) : (
            <div className="card table-wrap p-0"><table className="table">
              <thead><tr><th>{t("order")}</th><th>{t("customer")}</th><th className="text-right">{t("amount")}</th><th>{t("status")}</th></tr></thead>
              <tbody>{d.commissions.map((c) => <tr key={String(c.id)}><td>{String(c.order_no)}</td><td>{String(c.customer_name)}</td>
                <td className="text-right">{peso(c.amount as number)}</td><td><StatusBadge kind="generic" status={String(c.status)} /></td></tr>)}</tbody>
            </table></div>
          )}
          <div className="card">
            <h2 className="mb-2 font-bold">{t("adjustments")}</h2>
            {d.adjustments.length === 0 && <p className="text-sm text-brown/60">{t("noAdjustments")}</p>}
            <ul className="grid gap-1 text-sm">{d.adjustments.map((x) => (
              <li key={String(x.id)} className="flex justify-between gap-3 border-b border-brown/5 py-1">
                <span>{date(x.created_at as string, locale)} · {String(x.reason)}</span>
                <span className={Number(x.amount) < 0 ? "text-st-problem" : ""}>{peso(x.amount as number)} · {t(`adj_${x.status}`)}</span>
              </li>))}</ul>
            {boss && <AdjustmentForm agentId={id} />}
          </div>
        </div>
      )}

      {tab === "payouts" && (
        <div className="card table-wrap p-0">
          <table className="table">
            <thead><tr><th>{t("period")}</th><th className="text-right">{t("gross")}</th><th className="text-right">{t("adjustments")}</th><th className="text-right">{t("net")}</th><th>{t("status")}</th><th>{t("paidOn")}</th></tr></thead>
            <tbody>{d.payouts.map((p) => (
              <tr key={String(p.id)}>
                <td>{date(p.period_start as string, locale)} – {date(p.period_end as string, locale)}</td>
                <td className="text-right">{peso(p.gross as number)}</td><td className="text-right">{peso(p.adjustments as number)}</td>
                <td className="text-right font-bold">{peso(p.net as number)}</td><td><StatusBadge kind="generic" status={String(p.status)} /></td>
                <td>{p.paid_at ? `${date(p.paid_at as string, locale)} · ${p.method ?? ""} ${p.reference ?? ""}` : "—"}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}

      {tab === "rules" && showRates && (
        <RulesEditor agentId={id} canEdit={boss} products={opts(d.products)} categories={opts(d.categories)}
          rules={d.rules.map((r) => ({ id: String(r.id), scope: String(r.scope), target: String(r.product_name ?? r.category_name ?? ""),
            rateKind: String(r.rate_kind), rate: Number(r.rate), minSales: r.min_monthly_sales === null ? null : Number(r.min_monthly_sales),
            maxMonths: r.max_months === null ? null : Number(r.max_months), active: Boolean(r.active) }))}
          defaultNote={`${t("defaultRate")}: ${a.default_rate_kind === "percent" ? `${a.default_rate}%` : peso(a.default_rate as number) + " / " + t("perOrder")}`} />
      )}

      {tab === "profile" && (
        <>
          {boss ? <AgentForm agent={a} showRates={showRates} roles={d.roles.map((r) => ({ key: String(r.key), name: String(r.name) }))} teams={opts(d.teams)} />
            : <p className="card">{t("viewOnly")}</p>}
          <AuditHistory user={user} table="agents" id={id} />
        </>
      )}
    </>
  );
}
