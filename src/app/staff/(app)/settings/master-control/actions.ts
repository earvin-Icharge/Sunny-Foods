"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { runAction, UserError } from "@/lib/actions";
import { getSession } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { AREAS, type Area } from "@/lib/areas";
import { MODULES } from "@/lib/perms";

const MC = { area: "internal" as const, module: "settings" as const, level: 5, revalidate: ["/staff/settings/master-control"] };

/** One cell of the permission matrix (level + scope). */
export async function savePermission(roleKey: string, module: string, level: number, scope: string) {
  return runAction(MC, async (tx) => {
    if (roleKey === "owner") throw new UserError("The Owner always has full access.");
    if (!(MODULES as readonly string[]).includes(module)) throw new UserError("Unknown module.");
    if (!(level >= 0 && level <= 5)) throw new UserError("Invalid level.");
    await tx`insert into app.role_permissions (role_key, module, level, scope) values (${roleKey}, ${module}, ${level}, ${scope})
             on conflict (role_key, module) do update set level = excluded.level, scope = excluded.scope, deleted_at = null`;
    return null;
  });
}

/** Sensitive-field switch or agent/broker visibility setting for a role. */
export async function saveField(roleKey: string, field: string, value: string) {
  return runAction(MC, async (tx) => {
    if (roleKey === "owner" && !field.startsWith("ag_")) throw new UserError("The Owner always sees everything.");
    await tx`insert into app.field_visibility (role_key, field, value) values (${roleKey}, ${field}, ${value})
             on conflict (role_key, field) do update set value = excluded.value, deleted_at = null`;
    return null;
  });
}

export async function copyRole(fromKey: string, key: string, name: string) {
  return runAction(MC, async (tx) => {
    await tx`select app.copy_role(${fromKey}, ${key.trim().toLowerCase()}, ${name})`;
    return null;
  });
}

export async function renameRole(key: string, name: string) {
  return runAction(MC, async (tx) => {
    if (!name.trim()) throw new UserError("Name is required.");
    await tx`update app.roles set name = ${name.trim()} where key = ${key}`;
    return null;
  });
}

export async function setRoleActive(key: string, active: boolean) {
  return runAction(MC, async (tx) => {
    if (!active) {
      const [r] = await tx`select is_builtin from app.roles where key = ${key}`;
      if (r?.is_builtin) throw new UserError("Built-in roles cannot be deactivated.");
      const [n] = await tx`select count(*)::int as n from app.profiles where role_key = ${key} and active and deleted_at is null`;
      if (Number(n.n) > 0) throw new UserError("People still have this role. Change their role first.");
    }
    await tx`update app.roles set active = ${active} where key = ${key}`;
    return null;
  });
}

export async function saveApprovalRule(key: string, enabled: boolean, threshold: number | null) {
  return runAction(MC, async (tx) => {
    await tx`update app.approval_rules set enabled = ${enabled}, threshold = ${threshold} where key = ${key}`;
    return null;
  });
}

export async function rollback(auditId: number) {
  return runAction({ ...MC, revalidate: ["/staff/settings/master-control"] }, async (tx) => {
    await tx`select app.rollback_change(${auditId}::bigint)`;
    return null;
  });
}

/** "View as…": read-only preview of exactly what that person sees (Spec 3a). */
export async function startViewAs(userId: string) {
  const s = await getSession();
  if (!s || s.area !== "internal" || s.viewAs || (s.perms.modules.settings?.level ?? 0) < 5) throw new Error("Not allowed");
  const [target] = await asUser(s.id, (tx) => tx`select p.id, r.area from app.profiles p join app.roles r on r.key = p.role_key
    where p.id = ${userId} and p.active and p.deleted_at is null`);
  if (!target) throw new Error("User not found");
  (await cookies()).set("sf_view_as", String(target.id), { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 });
  redirect(AREAS[target.area as Area].prefix);
}

/** View as a role: previews the first active person with that role. */
export async function startViewAsRole(roleKey: string): Promise<{ ok: false; error: string } | void> {
  const s = await getSession();
  if (!s || s.area !== "internal" || (s.perms.modules.settings?.level ?? 0) < 5) return { ok: false, error: "Not allowed" };
  const [p] = await asUser(s.id, (tx) => tx`select id from app.profiles where role_key = ${roleKey} and active and deleted_at is null and id <> ${s.realUserId} order by created_at limit 1`);
  if (!p) return { ok: false, error: "Nobody has this role yet. Create a test account with this role first." };
  return startViewAs(String(p.id));
}
