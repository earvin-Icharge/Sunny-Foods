import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { CreateUserForm, Teams } from "./UserTools";

export const metadata = { title: "Users" };

const AREAS = ["internal", "agent", "portal"] as const;

export default async function UsersPage({ searchParams }: PageProps<"/staff/settings/users">) {
  const user = await requirePerm("internal", "settings");
  const t = await getTranslations("settings");
  const sp = await searchParams;
  const area = (AREAS as readonly string[]).includes(String(sp.area)) ? String(sp.area) : "internal";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const d = await readAs(user, async (tx) => ({
    users: await tx`select p.id, p.full_name, p.email, p.phone, p.active, p.role_key, r.name as role_name, tm.name as team_name,
        (select count(*)::int from app.user_permission_overrides o where o.user_id = p.id and o.deleted_at is null) as overrides
      from app.profiles p join app.roles r on r.key = p.role_key left join app.teams tm on tm.id = p.team_id
      where p.deleted_at is null and r.area = ${area} and p.anonymized_at is null
        and (${q} = '' or p.full_name ilike ${"%" + q + "%"} or p.email ilike ${"%" + q + "%"})
      order by p.active desc, r.sort, p.full_name limit 300`,
    roles: await tx`select key, name from app.roles where area = 'internal' and active and deleted_at is null order by sort`,
    teams: await tx`select t.id, t.name, (select count(*)::int from app.profiles p where p.team_id = t.id and p.active) as members
      from app.teams t where t.deleted_at is null order by t.name`,
  }));
  const canEdit = can(user.perms, "settings", 3);
  const roles = d.roles.filter((r) => user.roleKey === "owner" || r.key !== "owner").map((r) => ({ key: String(r.key), name: String(r.name) }));
  return (
    <>
      <PageHeader title={t("users")} back="/staff/settings" />
      <div className="mb-4 flex flex-wrap gap-2">
        {AREAS.map((a) => <Link key={a} href={`?area=${a}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${area === a ? "bg-sunny text-white" : "bg-white"}`}>{t(`area_${a}`)}</Link>)}
      </div>
      <form className="mb-4 flex gap-2"><input type="hidden" name="area" value={area} /><input className="input" name="q" defaultValue={q} placeholder={t("searchUsers")} /><button className="btn-secondary">{t("search")}</button></form>
      {area === "internal" && canEdit && <CreateUserForm roles={roles} teams={d.teams.map((x) => ({ id: String(x.id), name: String(x.name) }))} />}
      {area !== "internal" && <p className="mb-3 text-sm text-brown/70">{t(area === "agent" ? "agentUsersHelp" : "portalUsersHelp")}</p>}
      {d.users.length === 0 ? <Empty>{t("noUsers")}</Empty> : (
        <div className="card table-wrap mt-4 p-0">
          <table className="table">
            <thead><tr><th>{t("name")}</th><th>{t("role")}</th><th>{t("team")}</th><th>{t("status")}</th></tr></thead>
            <tbody>{d.users.map((u) => (
              <tr key={String(u.id)} className={u.active ? "" : "opacity-50"}>
                <td><Link className="font-bold text-sunny" href={`/staff/settings/users/${u.id}`}>{String(u.full_name || u.email)}</Link>
                  <div className="text-xs text-brown/60">{String(u.email ?? "")}</div></td>
                <td>{String(u.role_name)}{Number(u.overrides) > 0 && <span className="ml-2 rounded bg-gold/30 px-2 text-xs font-bold">{t("overridesCount", { n: Number(u.overrides) })}</span>}</td>
                <td>{String(u.team_name ?? "—")}</td>
                <td>{u.active ? t("active") : t("inactive")}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {area === "internal" && <Teams canEdit={canEdit} teams={d.teams.map((x) => ({ id: String(x.id), name: String(x.name), members: Number(x.members) }))} />}
    </>
  );
}
