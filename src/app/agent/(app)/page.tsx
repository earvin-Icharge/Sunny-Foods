import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { asUser } from "@/lib/db";
import { date, peso } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui/PageHeader";
import { PushOptIn } from "@/components/shell/PushOptIn";
import { getAgentCtx } from "./agent-context";

export const metadata = { title: "Home" };

// Tracker home (Spec 7.14): this month's sales, commission earned / pending, next payout, target progress.
export default async function AgentHome() {
  const ctx = await getAgentCtx();
  if (!ctx.agent) return null;
  const t = await getTranslations("agentPortal");
  const locale = await getLocale();
  const { home, board } = await asUser(ctx.user.id, async (tx) => {
    const [h] = await tx`select app.agent_home() as h`;
    const [b] = await tx`select app.agent_leaderboard() as b`;
    return { home: h.h as Record<string, unknown>, board: b.b as { rank: number; name: string | null; sales: number | null; me: boolean }[] };
  });
  const sales = Number(home.month_sales ?? 0);
  const target = home.target ? Number(home.target) : null;
  const pct = target ? Math.min(100, Math.round((sales / target) * 100)) : null;
  return (
    <>
      <PageHeader title={t("hello", { name: ctx.agent.name })} subtitle={`${t(`type_${ctx.agent.type}`)} · ${ctx.agent.referral_code}`} actions={<PushOptIn />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("monthSales")} value={peso(sales)} />
        <Stat label={t("commissionEarned")} value={peso(home.commission_earned as number)} tone="green" href="/agent/commissions" />
        <Stat label={t("commissionPending")} value={peso(home.commission_pending as number)} tone="orange" href="/agent/commissions" />
        <Stat label={t("nextPayout")} value={date(home.next_payout_date as string, locale)} href="/agent/payouts" />
      </div>
      {target !== null && pct !== null && (
        <section className="card mt-4">
          <div className="flex justify-between text-sm font-semibold"><span>{t("monthlyTarget")}</span><span>{peso(sales)} / {peso(target)} ({pct}%)</span></div>
          <div className="mt-2 h-4 overflow-hidden rounded-full bg-cream"><div className="h-full rounded-full bg-st-ok" style={{ width: `${pct}%` }} /></div>
        </section>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {ctx.canOrder && <Link className="btn-primary" href="/agent/new-order">➕ {t("newOrder")}</Link>}
        <Link className="btn-secondary" href="/agent/customers">👥 {t("myCustomersBtn")}</Link>
        {ctx.canRefer && <Link className="btn-secondary" href="/agent/invite">📨 {t("inviteBtn")}</Link>}
      </div>
      {board.length > 0 && (
        <section className="card mt-5">
          <h2 className="mb-2 text-lg font-bold">{t("leaderboard")}</h2>
          <ol className="grid gap-1">
            {board.map((r, i) => (
              <li key={i} className={`flex justify-between rounded-lg px-3 py-2 ${r.me ? "bg-gold/20 font-bold" : ""}`}>
                <span>#{r.rank} {r.name ?? t("anotherAgent")}</span><span>{r.sales !== null ? peso(r.sales) : ""}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
