import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { date, peso } from "@/lib/format";
import { fileUrl } from "@/lib/storage";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PrintButton } from "@/components/orders/PrintButton";
import { SettlementEditor } from "./SettlementEditor";

const ZH: Record<string, string> = {
  title: "代理离职结算", agent: "代理", lastDay: "最后工作日", customers: "客户安排", keep: "继续支付佣金", transfer: "转给其他代理",
  house: "公司直营（无佣金）", until: "至", forever: "长期", unpaid: "未付佣金", full: "全额支付", partial: "部分支付", forfeit: "放弃",
  amount: "结算金额", signAgent: "代理签名", signCompany: "公司签名", status: "状态",
};

/** Resignation settlement (Spec 7.13): decisions per customer + unpaid commission, EN + 中文 summary for signature. */
export default async function SettlementPage({ params }: PageProps<"/staff/agents/[id]/settlement/[sid]">) {
  const { id, sid } = await params;
  const user = await requirePerm("internal", "agents");
  const t = await getTranslations("agents");
  const locale = await getLocale();
  const d = await readAs(user, async (tx) => {
    const [s] = await tx`select s.*, a.name as agent_name from app.agent_settlements s join app.agents a on a.id = s.agent_id where s.id = ${sid} and s.agent_id = ${id}`;
    if (!s) return null;
    const ids = ((s.customer_decisions as { customer_id: string }[]) ?? []).map((x) => x.customer_id);
    const customers = await tx`select id, name from app.customers where id = any(${ids}::uuid[]) order by name`;
    const agents = await tx`select id, name from app.agents where deleted_at is null and status = 'active' and id <> ${id} order by name`;
    const unpaid = await tx`select coalesce(sum(amount), 0) as total, count(*)::int as n from app.commissions where agent_id = ${id} and status in ('pending','earned','approved')`;
    return { s, customers, agents, unpaid: unpaid[0] };
  });
  if (!d) notFound();
  const { s } = d;
  const decisions = (s.customer_decisions as { customer_id: string; action: string; to_agent_id: string | null; until: string | null }[]) ?? [];
  const name = (cid: string | null) => d.customers.find((c) => c.id === cid)?.name ?? d.agents.find((a) => a.id === cid)?.name ?? "—";
  const signedUrl = await fileUrl(s.signed_path as string | null);
  const unpaidTotal = s.status === "done" ? Number(s.unpaid_total) : Number(d.unpaid.total);
  return (
    <>
      <div className="no-print">
        <PageHeader title={t("settlementTitle")} subtitle={<>{String(s.agent_name)} · <StatusBadge kind="generic" status={String(s.status)} /></>} back={`/staff/agents/${id}`} />
        <SettlementEditor sid={sid} status={String(s.status)} canEdit={can(user.perms, "agents", 5)} unpaidTotal={unpaidTotal}
          decisions={decisions} customers={d.customers.map((c) => ({ id: String(c.id), name: String(c.name) }))}
          agents={d.agents.map((c) => ({ id: String(c.id), name: String(c.name) }))}
          commissionDecision={String(s.commission_decision)} settlementAmount={s.settlement_amount === null ? null : Number(s.settlement_amount)}
          notes={(s.notes as string) ?? ""} signedUrl={signedUrl} />
        <div className="my-6 flex items-center justify-between"><h2 className="text-xl font-bold">{t("printSummary")}</h2><PrintButton /></div>
      </div>
      {/* Printable summary, English + Chinese side by side */}
      <div className="mx-auto max-w-[800px] bg-white p-6 text-[13px] text-black">
        <div className="grid grid-cols-2 gap-6 border-b-2 border-black pb-2">
          <h1 className="text-xl font-bold">Agent Resignation Settlement</h1><h1 className="text-xl font-bold">{ZH.title}</h1>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-6">
          <div>Agent: <b>{String(s.agent_name)}</b><br />Last working day: <b>{date(s.last_working_day as string, "en")}</b><br />Status: {String(s.status)}</div>
          <div>{ZH.agent}：<b>{String(s.agent_name)}</b><br />{ZH.lastDay}：<b>{date(s.last_working_day as string, "zh-Hans")}</b><br />{ZH.status}：{String(s.status)}</div>
        </div>
        <table className="mt-4 w-full border-collapse">
          <thead><tr className="border-b border-black text-left"><th className="py-1">Customer / 客户</th><th>Decision</th><th>安排</th></tr></thead>
          <tbody>{decisions.map((x) => (
            <tr key={x.customer_id} className="border-b border-gray-300">
              <td className="py-1.5">{name(x.customer_id)}</td>
              <td>{x.action === "keep" ? `Keep paying ${x.until ? "until " + date(x.until, "en") : "(no end date)"}` : x.action === "transfer" ? `Transfer to ${name(x.to_agent_id)}` : "House account (no commission)"}</td>
              <td>{x.action === "keep" ? `${ZH.keep}${x.until ? ZH.until + date(x.until, "zh-Hans") : "（" + ZH.forever + "）"}` : x.action === "transfer" ? `${ZH.transfer}：${name(x.to_agent_id)}` : ZH.house}</td>
            </tr>))}</tbody>
        </table>
        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>Unpaid commission: <b>{peso(unpaidTotal)}</b><br />Decision: <b>{s.commission_decision === "full" ? "Pay in full" : s.commission_decision === "partial" ? `Pay partial: ${peso(s.settlement_amount as number)}` : "Forfeit"}</b></div>
          <div>{ZH.unpaid}：<b>{peso(unpaidTotal)}</b><br />{ZH.status}：<b>{s.commission_decision === "full" ? ZH.full : s.commission_decision === "partial" ? `${ZH.partial}：${peso(s.settlement_amount as number)}` : ZH.forfeit}</b></div>
        </div>
        {s.notes ? <p className="mt-3">{String(s.notes)}</p> : null}
        <div className="mt-16 grid grid-cols-2 gap-10">
          <div className="border-t border-black pt-1">Agent signature / {ZH.signAgent} · Date</div>
          <div className="border-t border-black pt-1">Sunny Foods Inc. / {ZH.signCompany} · Date</div>
        </div>
        <p className="mt-4 text-xs text-gray-500">{date(new Date(), locale)}</p>
      </div>
    </>
  );
}
