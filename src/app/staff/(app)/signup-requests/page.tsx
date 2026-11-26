import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { RequestCard, type Req } from "./RequestTools";

export const metadata = { title: "Sign-up requests" };

/** Staff and agents who signed up themselves, waiting for the boss (decision D1, 2026-11-26). */
export default async function SignupRequestsPage() {
  const user = await requireArea("internal");
  const canStaff = can(user.perms, "settings", 3);
  const canAgents = can(user.perms, "agents", 5);
  if (!canStaff && !canAgents) redirect("/staff/not-allowed");
  const t = await getTranslations("signupRequests");
  const d = await readAs(user, async (tx) => ({
    pending: await tx`select id, area, full_name, email, phone, note, agent_type, created_at, email_confirmed_at
      from app.signup_requests where status = 'pending' and deleted_at is null order by created_at`,
    decided: await tx`select r.id, r.area, r.full_name, r.email, r.status, r.reason, r.decided_at, p.full_name as decided_by_name
      from app.signup_requests r left join app.profiles p on p.id = r.decided_by
      where r.status <> 'pending' and r.deleted_at is null order by r.decided_at desc nulls last limit 20`,
    roles: await tx`select key, name, area from app.roles where area in ('internal','agent') and active and deleted_at is null order by sort`,
    teams: await tx`select id, name from app.teams where deleted_at is null order by name`,
  }));
  const roles = d.roles.filter((r) => user.roleKey === "owner" || r.key !== "owner")
    .map((r) => ({ key: String(r.key), name: String(r.name), area: String(r.area) }));
  const teams = d.teams.map((x) => ({ id: String(x.id), name: String(x.name) }));
  const ready = d.pending.filter((r) => r.email_confirmed_at) as unknown as Req[];
  const unconfirmed = d.pending.length - ready.length;
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {ready.length === 0 ? <Empty>{t("none")}</Empty> : (
        <div className="grid gap-3">
          {ready.map((r) => <RequestCard key={String(r.id)} req={{ ...r, id: String(r.id), created_at: String(r.created_at) }}
            roles={roles.filter((x) => x.area === r.area)} teams={teams}
            canDecide={r.area === "internal" ? canStaff : canAgents} />)}
        </div>
      )}
      {unconfirmed > 0 && <p className="mt-3 text-sm text-brown/60">{t("waitingForCode", { n: unconfirmed })}</p>}
      {d.decided.length > 0 && (
        <section className="card table-wrap mt-6 p-0">
          <h2 className="px-4 pt-4 text-lg font-bold">{t("recent")}</h2>
          <table className="table">
            <thead><tr><th>{t("name")}</th><th>{t("app")}</th><th>{t("decision")}</th><th>{t("decidedBy")}</th></tr></thead>
            <tbody>{d.decided.map((r) => (
              <tr key={String(r.id)}>
                <td><b>{String(r.full_name)}</b><div className="text-xs text-brown/60">{String(r.email)}</div></td>
                <td>{t(`area_${String(r.area)}`)}</td>
                <td>{t(`status_${String(r.status)}`)}{r.reason ? <div className="text-xs text-brown/60">{String(r.reason)}</div> : null}</td>
                <td>{String(r.decided_by_name ?? "—")}</td>
              </tr>))}</tbody>
          </table>
        </section>
      )}
    </>
  );
}
