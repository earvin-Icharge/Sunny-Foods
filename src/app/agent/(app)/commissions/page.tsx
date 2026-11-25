import { getLocale, getTranslations } from "next-intl/server";
import { asUser } from "@/lib/db";
import { date, peso } from "@/lib/format";
import { PageHeader, Empty, Stat } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireAgent } from "../agent-context";

export const metadata = { title: "Commissions" };

type Line = { id: string; order_no: string; customer_name: string; created_at: string; status: string; amount: number; void_reason: string | null;
  base_amount?: number | null; rate?: number | null; rate_kind?: string | null; share_pct?: number | null; transferred: boolean };

// Commission ledger (Spec 7.14). Rate/base shown only if Master Control allows "rate and rule breakdown".
export default async function AgentCommissions({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAgent();
  const t = await getTranslations("agentPortal");
  const locale = await getLocale();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : "";
  const data = await asUser(ctx.user.id, async (tx) =>
    (await tx`select app.agent_commissions(${month ? month + "-01" : null}::date) as c`)[0].c as { lines: Line[]; adjustments: { id: string; amount: number; reason: string; status: string; created_at: string }[] });
  const sum = (s: string[]) => data.lines.filter((l) => s.includes(l.status)).reduce((a, l) => a + Number(l.amount), 0);
  const breakdown = data.lines.some((l) => l.rate !== null && l.rate !== undefined);
  return (
    <>
      <PageHeader title={t("commissions")} />
      <form className="mb-4 flex gap-2">
        <input type="month" name="month" defaultValue={month} className="input max-w-52" />
        <button className="btn-secondary">{t("filter")}</button>
      </form>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("st_pending")} value={peso(sum(["pending"]))} tone="orange" />
        <Stat label={t("st_earned")} value={peso(sum(["earned", "approved"]))} tone="green" />
        <Stat label={t("st_paid")} value={peso(sum(["paid"]))} />
        <Stat label={t("st_voided")} value={peso(sum(["voided"]))} tone="red" />
      </div>
      <p className="mb-3 text-sm text-brown/70">{t("commissionRule")}</p>
      {data.lines.length === 0 ? <Empty>{t("noCommissions")}</Empty> : (
        <div className="table-wrap card !p-0">
          <table className="table">
            <thead><tr><th>{t("date")}</th><th>{t("order")}</th><th>{t("customer")}</th>
              {breakdown && <><th className="text-right">{t("base")}</th><th className="text-right">{t("rate")}</th></>}
              <th className="text-right">{t("commission")}</th><th>{t("status")}</th></tr></thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id}>
                  <td>{date(l.created_at, locale)}</td><td>{l.order_no}</td><td>{l.customer_name}{l.transferred ? <span className="ml-1 text-xs text-brown/60">({t("transferredIn")})</span> : null}</td>
                  {breakdown && <><td className="text-right">{peso(l.base_amount)}</td>
                    <td className="text-right">{l.rate_kind === "fixed" ? t("fixed") : `${Number(l.rate)}%`}{l.share_pct && Number(l.share_pct) < 100 ? ` × ${Number(l.share_pct)}%` : ""}</td></>}
                  <td className="text-right font-semibold">{peso(l.amount)}</td>
                  <td><StatusBadge kind="generic" status={l.status} />{l.void_reason ? <div className="text-xs text-brown/60">{l.void_reason}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.adjustments.length > 0 && (
        <section className="card mt-4">
          <h2 className="mb-2 font-bold">{t("adjustments")}</h2>
          <ul className="grid gap-1 text-sm">{data.adjustments.map((a) => <li key={a.id} className="flex justify-between"><span>{date(a.created_at, locale)} · {a.reason}</span><b className={a.amount < 0 ? "text-st-problem" : ""}>{peso(a.amount)}</b></li>)}</ul>
        </section>
      )}
    </>
  );
}
