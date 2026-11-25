import { getLocale, getTranslations } from "next-intl/server";
import { asUser } from "@/lib/db";
import { date } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PrivacyRequests } from "@/components/portal/PrivacyRequests";
import { getAgentCtx } from "../agent-context";

export const metadata = { title: "My account" };

// Agent's own details + Data Privacy Act requests (copy / deletion) — Spec 7.10.
export default async function AgentAccount() {
  const ctx = await getAgentCtx();
  const t = await getTranslations("agentPortal");
  const locale = await getLocale();
  const reqs = await asUser(ctx.user.id, (tx) => tx`select kind, status, created_at from app.data_requests where profile_id = ${ctx.user.id} order by created_at desc limit 10`);
  return (
    <>
      <PageHeader title={t("account")} />
      <section className="card grid gap-1">
        <b className="text-lg">{ctx.user.fullName}</b>
        <span className="text-brown/70">{ctx.user.email}</span>
        {ctx.agent && <span className="text-sm">{t(`type_${ctx.agent.type}`)} · {ctx.agent.referral_code}{ctx.agent.last_working_day ? ` · ${t("lastDay")} ${date(ctx.agent.last_working_day, locale)}` : ""}</span>}
        <p className="mt-2 text-sm text-brown/60">{t("accountHelp")}</p>
      </section>
      <div className="mt-4"><PrivacyRequests /></div>
      {reqs.length > 0 && (
        <ul className="card mt-4 grid gap-1 text-sm">
          {reqs.map((r, i) => <li key={i}>{date(r.created_at as string, locale)} · {t(`request_${r.kind}`)} · <StatusBadge kind="generic" status={String(r.status)} /></li>)}
        </ul>
      )}
    </>
  );
}
