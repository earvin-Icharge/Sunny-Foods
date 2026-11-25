import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, MODULES, SENSITIVE_FIELDS, AGENT_FIELDS } from "@/lib/perms";
import { PageHeader } from "@/components/ui/PageHeader";
import { AuditHistory } from "@/components/ui/AuditHistory";
import { UserProfileForm, UserButtons, OverridesEditor } from "./UserDetail";

/** One person's account + per-person access overrides (Spec 3a). */
export default async function UserPage({ params }: PageProps<"/staff/settings/users/[id]">) {
  const { id } = await params;
  const user = await requirePerm("internal", "settings");
  const t = await getTranslations("settings");
  const d = await readAs(user, async (tx) => {
    const [p] = await tx`select p.*, r.area, r.name as role_name, r.is_agent_role from app.profiles p join app.roles r on r.key = p.role_key where p.id = ${id}`;
    if (!p) return null;
    const roles = await tx`select key, name from app.roles where area = ${String(p.area)} and active and deleted_at is null order by sort`;
    const teams = await tx`select id, name from app.teams where deleted_at is null order by name`;
    const roleLevels = await tx`select module, level, scope from app.role_permissions where role_key = ${String(p.role_key)} and deleted_at is null`;
    const roleFields = await tx`select field, value from app.field_visibility where role_key = ${String(p.role_key)} and deleted_at is null`;
    const overrides = can(user.perms, "settings", 5) ? await tx`select module, level, scope, field, value from app.user_permission_overrides where user_id = ${id} and deleted_at is null` : [];
    return { p, roles, teams, roleLevels, roleFields, overrides };
  });
  if (!d) notFound();
  const { p } = d;
  const isAgentArea = p.area === "agent";
  const fieldList = isAgentArea ? [...AGENT_FIELDS] : p.area === "internal" ? [...SENSITIVE_FIELDS] : [];
  const roleMod: Record<string, { level: number; scope: string }> = {};
  for (const r of d.roleLevels) roleMod[String(r.module)] = { level: Number(r.level), scope: String(r.scope) };
  const roleFld: Record<string, string> = {};
  for (const r of d.roleFields) roleFld[String(r.field)] = String(r.value);
  const ovMod: Record<string, { level: number | null; scope: string | null }> = {};
  const ovFld: Record<string, string> = {};
  for (const o of d.overrides) {
    if (o.module) ovMod[String(o.module)] = { level: o.level === null ? null : Number(o.level), scope: (o.scope as string) ?? null };
    if (o.field) ovFld[String(o.field)] = String(o.value);
  }
  const isOwner = p.role_key === "owner";
  return (
    <>
      <PageHeader title={String(p.full_name || p.email)} subtitle={`${p.role_name} · ${p.email ?? ""}${p.active ? "" : " · " + t("inactive")}`} back={`/staff/settings/users?area=${p.area}`}
        actions={can(user.perms, "settings", 3) && <UserButtons id={id} active={Boolean(p.active)} canViewAs={can(user.perms, "settings", 5) && id !== user.realUserId && Boolean(p.active)} />} />
      <UserProfileForm id={id} canEdit={can(user.perms, "settings", 3)} profile={{ full_name: String(p.full_name ?? ""), phone: String(p.phone ?? ""), role_key: String(p.role_key), team_id: String(p.team_id ?? "") }}
        roles={d.roles.filter((r) => user.roleKey === "owner" || r.key !== "owner").map((r) => ({ key: String(r.key), name: String(r.name) }))}
        teams={d.teams.map((x) => ({ id: String(x.id), name: String(x.name) }))} />
      {can(user.perms, "settings", 5) && !isOwner && (
        <>
          <h2 className="mb-1 mt-8 text-xl font-bold">{t("overridesTitle")}</h2>
          <p className="mb-3 text-sm text-brown/70">{t("overridesHelp")}</p>
          <OverridesEditor userId={id} modules={isAgentArea || p.area === "portal" ? ["orders", "customers", "agents"] : [...MODULES]}
            fields={fieldList} roleMod={roleMod} roleFld={roleFld} ovMod={ovMod} ovFld={ovFld} agentArea={isAgentArea} />
        </>
      )}
      <AuditHistory user={user} table="profiles" id={id} />
    </>
  );
}
