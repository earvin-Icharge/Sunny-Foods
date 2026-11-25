import { getLocale, getTranslations } from "next-intl/server";
import { asUser } from "@/lib/db";
import { date, peso } from "@/lib/format";
import { fileUrl } from "@/lib/storage";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { requireAgent } from "../agent-context";

export const metadata = { title: "Payouts" };

type P = { id: string; period_start: string; period_end: string; gross: number; adjustments: number; net: number; paid_at: string; method: string | null; reference: string | null; proof_path: string | null };

// Payout history with proof of payment (Spec 7.14).
export default async function AgentPayouts() {
  const ctx = await requireAgent();
  const t = await getTranslations("agentPortal");
  const locale = await getLocale();
  const rows = await asUser(ctx.user.id, async (tx) => (await tx`select app.agent_payouts() as p`)[0].p as P[]);
  const withProof = await Promise.all(rows.map(async (p) => ({ ...p, proof: await fileUrl(p.proof_path) })));
  return (
    <>
      <PageHeader title={t("payouts")} />
      {withProof.length === 0 ? <Empty>{t("noPayouts")}</Empty> : (
        <div className="grid gap-3">
          {withProof.map((p) => (
            <div key={p.id} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <b>{date(p.period_start, locale)} – {date(p.period_end, locale)}</b>
                <div className="text-sm text-brown/60">{t("paidOn")} {date(p.paid_at, locale)} · {p.method ?? ""} {p.reference ? `· ${p.reference}` : ""}</div>
                {Number(p.adjustments) !== 0 && <div className="text-sm">{t("gross")} {peso(p.gross)} · {t("adjustments")} {peso(p.adjustments)}</div>}
              </div>
              <b className="text-xl text-st-ok">{peso(p.net)}</b>
              {p.proof && <a className="btn-secondary btn-sm" href={p.proof} target="_blank" rel="noreferrer">{t("viewProof")}</a>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
