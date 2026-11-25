import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { date, peso } from "@/lib/format";
import { fileUrl } from "@/lib/storage";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PayoutRunForm, PayoutRowActions, ApproveAll } from "./PayoutTools";

export const metadata = { title: "Commission payouts" };

/** Payout run (Spec 7.13): period → Earned commissions per agent → approve → export → mark Paid. */
export default async function PayoutsPage({ searchParams }: PageProps<"/staff/agents/payouts">) {
  const user = await requirePerm("internal", "agents");
  const t = await getTranslations("agents");
  const locale = await getLocale();
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "open";
  const rows = await readAs(user, (tx) => tx`
    select p.*, a.name as agent_name, a.payout_method as agent_method, a.payout_name,
      (select count(*)::int from app.commissions c where c.payout_id = p.id) as lines
    from app.commission_payouts p join app.agents a on a.id = p.agent_id
    where p.deleted_at is null and (${status} = 'all' or (${status} = 'open' and p.status in ('draft','approved')) or p.status = ${status})
    order by p.period_end desc, a.name limit 300`);
  const [earned] = await readAs(user, (tx) => tx`select coalesce(sum(amount), 0) as total, count(*)::int as n from app.commissions where status = 'earned' and payout_id is null`);
  const boss = can(user.perms, "agents", 5);
  const proofs = await Promise.all(rows.map((r) => fileUrl(r.proof_path as string | null)));
  const drafts = rows.filter((r) => r.status === "draft").map((r) => String(r.id));
  return (
    <>
      <PageHeader title={t("payouts")} back="/staff/agents" subtitle={t("earnedWaiting", { amount: peso(earned.total as number), n: Number(earned.n) })}
        actions={<a className="btn-secondary" href={`/api/payouts?status=${status}`}>{t("exportExcel")}</a>} />
      {boss && <PayoutRunForm />}
      <div className="my-4 flex flex-wrap items-center gap-2">
        {["open", "paid", "cancelled", "all"].map((s) => (
          <a key={s} href={`?status=${s}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${status === s ? "bg-sunny text-white" : "bg-white"}`}>{t(`filter_${s}`)}</a>
        ))}
        {boss && drafts.length > 0 && <ApproveAll ids={drafts} />}
      </div>
      {rows.length === 0 ? <Empty>{t("noPayouts")}</Empty> : (
        <div className="grid gap-3">
          {rows.map((p, i) => (
            <div key={String(p.id)} className="card flex flex-wrap items-center gap-4">
              <div className="min-w-48 flex-1">
                <div className="font-bold">{String(p.agent_name)}</div>
                <div className="text-sm text-brown/60">{date(p.period_start as string, locale)} – {date(p.period_end as string, locale)} · {String(p.lines)} {t("lines")}</div>
                <div className="text-xs text-brown/60">{p.agent_method ? String(p.agent_method).toUpperCase() : ""} {String(p.payout_name ?? "")}</div>
              </div>
              <div className="text-right text-sm">
                <div>{t("gross")}: {peso(p.gross as number)}</div>
                <div>{t("adjustments")}: {peso(p.adjustments as number)}</div>
                <div className="text-lg font-bold">{peso(p.net as number)}</div>
              </div>
              <StatusBadge kind="generic" status={String(p.status)} />
              {p.status === "paid" && <div className="text-xs">{date(p.paid_at as string, locale)} · {String(p.method ?? "")} {String(p.reference ?? "")}
                {proofs[i] && <> · <a className="text-sunny underline" href={proofs[i]!} target="_blank" rel="noreferrer">{t("proof")}</a></>}</div>}
              {boss && <PayoutRowActions id={String(p.id)} status={String(p.status)} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
