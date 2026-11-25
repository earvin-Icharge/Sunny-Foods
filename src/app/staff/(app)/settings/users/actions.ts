"use server";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { runAction, UserError } from "@/lib/actions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

function str(fd: FormData, k: string) { const v = fd.get(k); return v === null || String(v).trim() === "" ? null : String(v).trim(); }

/** Create a staff account (Boss creates accounts — Spec 3). Shows a one-time password. */
export async function createStaffUser(fd: FormData) {
  return runAction({ area: "internal", module: "settings", level: 3, revalidate: ["/staff/settings/users"] }, async (tx) => {
    const email = str(fd, "email")?.toLowerCase(); const name = str(fd, "full_name"); const role = str(fd, "role_key");
    if (!email || !name || !role) throw new UserError("Name, email and role are required.");
    const [r] = await tx`select area from app.roles where key = ${role} and active and deleted_at is null`;
    if (!r || r.area !== "internal") throw new UserError("Choose a staff role.");
    const password = "Sf-" + randomBytes(6).toString("base64url");
    const { data, error } = await supabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error || !data.user) throw new UserError("Could not create login: " + (error?.message ?? "unknown error"));
    try {
      // inserted as the logged-in boss so the database guards (e.g. Admin cannot create Owners) apply
      await tx`insert into app.profiles (id, full_name, email, phone, role_key, team_id, must_change_password)
               values (${data.user.id}, ${name}, ${email}, ${str(fd, "phone")}, ${role}, ${str(fd, "team_id")}, true)`;
    } catch (e) {
      await supabaseAdmin().auth.admin.deleteUser(data.user.id);
      throw e;
    }
    return { id: data.user.id, email, password };
  });
}

export async function updateUser(id: string, fd: FormData) {
  return runAction({ area: "internal", module: "settings", level: 3, revalidate: [`/staff/settings/users/${id}`, "/staff/settings/users"], audit: { table: "profiles", id: () => id } }, async (tx) => {
    const role = str(fd, "role_key");
    const [cur] = await tx`select p.role_key, r.area from app.profiles p join app.roles r on r.key = p.role_key where p.id = ${id}`;
    if (!cur) throw new UserError("User not found.");
    if (role) {
      const [nr] = await tx`select area from app.roles where key = ${role}`;
      if (!nr || nr.area !== cur.area) throw new UserError("A role can only be changed to another role of the same area.");
    }
    await tx`update app.profiles set full_name = ${str(fd, "full_name") ?? ""}, phone = ${str(fd, "phone")},
      role_key = ${role ?? String(cur.role_key)}, team_id = ${str(fd, "team_id")} where id = ${id}`;
    return id;
  });
}

/** Deactivate / reactivate: the database keeps at least one active Owner. */
export async function setUserActive(id: string, active: boolean) {
  return runAction({ area: "internal", module: "settings", level: 3, revalidate: [`/staff/settings/users/${id}`, "/staff/settings/users"] }, async (tx, u) => {
    if (id === u.realUserId && !active) throw new UserError("You cannot deactivate your own account.");
    await tx`update app.profiles set active = ${active} where id = ${id}`;
    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
    if (error) throw new UserError("Login could not be updated: " + error.message);
    return null;
  });
}

export async function sendPasswordReset(id: string) {
  return runAction({ area: "internal", module: "settings", level: 3 }, async (tx) => {
    const [p] = await tx`select email from app.profiles where id = ${id}`;
    if (!p?.email) throw new UserError("This account has no email.");
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    const sb = createClient(env.supabaseUrl, env.publishableKey, { auth: { persistSession: false } });
    const { error } = await sb.auth.resetPasswordForEmail(String(p.email), { redirectTo: `${origin}/api/auth/confirm?next=/staff/reset-password` });
    if (error) throw new UserError(error.message);
    return null;
  });
}

export async function saveTeam(id: string | null, name: string) {
  return runAction({ area: "internal", module: "settings", level: 3, revalidate: ["/staff/settings/users"] }, async (tx) => {
    if (!name.trim()) throw new UserError("Team name is required.");
    if (id) await tx`update app.teams set name = ${name.trim()} where id = ${id}`;
    else await tx`insert into app.teams (name) values (${name.trim()})`;
    return null;
  });
}

export async function removeTeam(id: string) {
  return runAction({ area: "internal", module: "settings", level: 3, revalidate: ["/staff/settings/users"] }, async (tx) => {
    await tx`update app.profiles set team_id = null where team_id = ${id}`;
    await tx`update app.teams set deleted_at = now() where id = ${id}`;
    return null;
  });
}

// ---------------- Per-person overrides (Master Control, Spec 3a) ----------------
export async function setModuleOverride(userId: string, module: string, level: number | null, scope: string | null) {
  return runAction({ area: "internal", module: "settings", level: 5, revalidate: [`/staff/settings/users/${userId}`] }, async (tx) => {
    const [ex] = await tx`select id from app.user_permission_overrides where user_id = ${userId} and module = ${module} and deleted_at is null`;
    if (level === null && scope === null) {
      if (ex) await tx`update app.user_permission_overrides set deleted_at = now() where id = ${ex.id as string}`;
      return null;
    }
    if (ex) await tx`update app.user_permission_overrides set level = ${level}, scope = ${scope} where id = ${ex.id as string}`;
    else await tx`insert into app.user_permission_overrides (user_id, module, level, scope) values (${userId}, ${module}, ${level}, ${scope})`;
    return null;
  });
}

export async function setFieldOverride(userId: string, field: string, value: string | null) {
  return runAction({ area: "internal", module: "settings", level: 5, revalidate: [`/staff/settings/users/${userId}`] }, async (tx) => {
    const [ex] = await tx`select id from app.user_permission_overrides where user_id = ${userId} and field = ${field} and deleted_at is null`;
    if (value === null) {
      if (ex) await tx`update app.user_permission_overrides set deleted_at = now() where id = ${ex.id as string}`;
      return null;
    }
    if (ex) await tx`update app.user_permission_overrides set value = ${value} where id = ${ex.id as string}`;
    else await tx`insert into app.user_permission_overrides (user_id, field, value) values (${userId}, ${field}, ${value})`;
    return null;
  });
}

export async function resetOverrides(userId: string) {
  return runAction({ area: "internal", module: "settings", level: 5, revalidate: [`/staff/settings/users/${userId}`] }, async (tx) => {
    await tx`update app.user_permission_overrides set deleted_at = now() where user_id = ${userId} and deleted_at is null`;
    return null;
  });
}
