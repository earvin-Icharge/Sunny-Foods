import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { dateTime } from "@/lib/format";
import { MODULES, SENSITIVE_FIELDS, AGENT_FIELDS } from "@/lib/perms";
import { PageHeader } from "@/components/ui/PageHeader";
import { MatrixEditor, FieldsEditor, AgentPanel, RolesEditor, ApprovalRulesEditor, ViewAsPanel, RollbackButton } from "./Editors";

export const metadata = { title: "Master Control" };

const TABS = ["matrix", "fields", "agents", "roles", "approvals", "viewas", "history"] as const;

/** Master Control (Spec 3a): who sees and does what. Owner (or Admin granted level 5) only. */
export default async function MasterControl({ searchParams }: PageProps<"/staff/settings/master-control">) {
  const user = await requirePerm("internal", "settings", 5);
  const t = await getTranslations("masterControl");
  const locale = await getLocale();
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab)) ? String(sp.tab) : "matrix";
  const d = await readAs(user, async (tx) => ({
    roles: await tx`select key, name, area, is_builtin, is_agent_role, active, based_on,
        (select count(*)::int from app.profiles p where p.role_key = r.key and p.active and p.deleted_at is null) as people
      from app.roles r where r.deleted_at is null order by r.area, r.sort, r.name`,
    perms: await tx`select role_key, module, level, scope from app.role_permissions where deleted_at is null`,
    fields: await tx`select role_key, field, value from app.field_visibility where deleted_at is null`,
    approvals: tab === "approvals" ? await tx`select key, label, enabled, threshold from app.approval_rules where deleted_at is null order by label` : [],
    categories: tab === "agents" ? await tx`select id, name from app.categories where deleted_at is null order by sort` : [],
    people: tab === "viewas" ? await tx`select p.id, p.full_name, p.email, r.name as role_name, r.area from app.profiles p join app.roles r on r.key = p.role_key
      where p.active and p.deleted_at is null and p.id <> ${user.realUserId} order by r.area, r.sort, p.full_name limit 500` : [],
    history: tab === "history" ? await tx`select a.id, a.at, a.action, a.table_name, a.changed_fields, a.old_data, a.new_data, coalesce(p.full_name, 'System') as who
      from app.audit_log a left join app.profiles p on p.id = a.user_id
      where a.table_name in ('roles','role_permissions','field_visibility','user_permission_overrides','approval_rules','profiles')
      order by a.at desc limit 150` : [],
  }));
  const roles = d.roles.map((r) => ({ key: String(r.key), name: String(r.name), area: String(r.area), builtin: Boolean(r.is_builtin),
    agentRole: Boolean(r.is_agent_role), active: Boolean(r.active), basedOn: (r.based_on as string) ?? null, people: Number(r.people) }));
  const perms: Record<string, { level: number; scope: string }> = {};
  for (const p of d.perms) perms[`${p.role_key}:${p.module}`] = { level: Number(p.level), scope: String(p.scope) };
  const fields: Record<string, string> = {};
  for (const f of d.fields) fields[`${f.role_key}:${f.field}`] = String(f.value);
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} back="/staff/settings" />
      <nav className="no-print mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((x) => (
          <Link key={x} href={`?tab=${x}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${tab === x ? "bg-sunny text-white" : "bg-white text-brown"}`}>{t(`tab_${x}`)}</Link>
        ))}
      </nav>
      {tab === "matrix" && <MatrixEditor roles={roles.filter((r) => r.active)} modules={[...MODULES]} perms={perms} />}
      {tab === "fields" && <FieldsEditor roles={roles.filter((r) => r.active && r.area === "internal")} fieldNames={[...SENSITIVE_FIELDS]} values={fields} />}
      {tab === "agents" && <AgentPanel roles={roles.filter((r) => r.active && r.agentRole)} fieldNames={[...AGENT_FIELDS]} values={fields}
        categories={d.categories.map((c) => ({ id: String(c.id), name: String(c.name) }))} />}
      {tab === "roles" && <RolesEditor roles={roles} />}
      {tab === "approvals" && <ApprovalRulesEditor rules={d.approvals.map((a) => ({ key: String(a.key), label: String(a.label), enabled: Boolean(a.enabled), threshold: a.threshold === null ? null : Number(a.threshold) }))} />}
      {tab === "viewas" && <ViewAsPanel roles={roles.filter((r) => r.active && r.key !== "owner")}
        people={d.people.map((p) => ({ id: String(p.id), name: String(p.full_name || p.email), role: String(p.role_name), area: String(p.area) }))} />}
      {tab === "history" && (
        <div className="card">
          <p className="mb-3 text-sm text-brown/70">{t("historyHelp")}</p>
          <ul className="grid gap-3 text-sm">
            {d.history.map((h) => {
              const hide = new Set(["updated_at", "created_at", "created_by", "id"]);
              const ch = ((h.changed_fields as string[] | null) ?? []).filter((f) => !hide.has(f));
              const o = (h.old_data ?? {}) as Record<string, unknown>; const n = (h.new_data ?? {}) as Record<string, unknown>;
              const subject = String(n.role_key ?? o.role_key ?? n.key ?? o.key ?? n.full_name ?? o.full_name ?? n.user_id ?? "");
              const what = String(n.module ?? n.field ?? o.module ?? o.field ?? "");
              return (
                <li key={String(h.id)} className="flex flex-wrap items-start gap-3 border-b border-brown/5 pb-2">
                  <div className="min-w-0 flex-1">
                    <div><b>{String(h.who)}</b> · {t(`table_${h.table_name}`)} · <span className="text-brown/60">{dateTime(h.at as string, locale)}</span></div>
                    <div className="text-brown/80">{subject}{what ? ` → ${what}` : ""} · {String(h.action)}</div>
                    {ch.length > 0 && <ul className="text-brown/70">{ch.map((f) => <li key={f}><code>{f}</code>: {fmt(o[f])} → {fmt(n[f])}</li>)}</ul>}
                  </div>
                  {["insert", "update", "soft_delete"].includes(String(h.action)) && <RollbackButton auditId={Number(h.id)} />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
  return String(v).slice(0, 60);
}
