"use server";
import { randomInt } from "node:crypto";
import { runAction, UserError } from "@/lib/actions";
import { asSystem } from "@/lib/db";
import { can } from "@/lib/perms";

function str(fd: FormData, k: string) { const v = fd.get(k); return v === null || String(v).trim() === "" ? null : String(v).trim(); }

/**
 * Boss approves a staff / agent sign-up (decision D1, 2026-11-26): picks the role
 * (and team / agent type), which creates their profile so they can log in.
 * Staff requests need Settings level 3, agent requests need Agents level 5
 * (the same rights as creating those accounts by hand).
 */
export async function approveSignup(id: string, fd: FormData) {
  return runAction({ area: "internal", revalidate: ["/staff/signup-requests", "/staff/settings/users", "/staff/agents"], audit: { table: "signup_requests", id: () => id } }, async (tx, user) => {
    const [r] = await tx`select * from app.signup_requests where id = ${id} and deleted_at is null for update`;
    if (!r) throw new UserError("Request not found.");
    if (r.status !== "pending") throw new UserError("This request was already decided.");
    if (!r.email_confirmed_at) throw new UserError("They have not confirmed their email yet.");
    const area = String(r.area);
    if (area === "internal" ? !can(user.perms, "settings", 3) : !can(user.perms, "agents", 5)) throw new UserError("You are not allowed to do this.");
    const uid = String(r.user_id);
    const roleKey = str(fd, "role_key") ?? (area === "agent" ? String(r.agent_type ?? "agent") : null);
    if (!roleKey) throw new UserError("Choose a role.");
    const [role] = await tx`select area from app.roles where key = ${roleKey} and active and deleted_at is null`;
    if (!role || role.area !== area) throw new UserError("Choose a role for this app.");

    if (area === "internal") {
      // inserted as the logged-in boss so the database guards (e.g. Admin cannot create Owners) apply
      await tx`insert into app.profiles (id, full_name, email, phone, role_key, team_id)
               values (${uid}, ${String(r.full_name)}, ${String(r.email)}, ${(r.phone as string) ?? null}, ${roleKey}, ${str(fd, "team_id")})`;
    } else {
      const type = roleKey === "broker" ? "broker" : "agent";
      const base = "AG-" + String(r.full_name).split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
      const [taken] = await tx`select 1 from app.agents where referral_code = ${base}`;
      const code = taken ? `${base}-${randomInt(100, 999)}` : base;
      const [a] = await tx`insert into app.agents (name, type, role_key, phone, email, referral_code, default_rate_kind, default_rate)
        values (${String(r.full_name)}, ${type}, ${roleKey}, ${(r.phone as string) ?? null}, ${String(r.email)}, ${code},
                ${str(fd, "default_rate_kind") ?? "percent"}, ${Number(str(fd, "default_rate") ?? 0)}) returning id`;
      // agent first, then the profile pointing to it, then link back (foreign key order, L-007)
      await asSystem((s) => s`insert into app.profiles (id, full_name, email, phone, role_key, agent_id)
        values (${uid}, ${String(r.full_name)}, ${String(r.email)}, ${(r.phone as string) ?? null}, ${roleKey}, ${String(a.id)})`);
      await tx`update app.agents set profile_id = ${uid} where id = ${String(a.id)}`;
    }
    // they ticked the privacy consent box when signing up
    await asSystem((s) => s`insert into app.privacy_consents (profile_id, policy_version, ip, user_agent)
      values (${uid}, coalesce(app.setting('privacy_policy_version') #>> '{}', 'unknown'), ${(r.ip as string) ?? null}, 'self sign-up')`);
    await tx`update app.signup_requests set status = 'approved', decided_by = ${user.realUserId}, decided_at = now() where id = ${id}`;
    return { id };
  });
}

export async function rejectSignup(id: string, reason: string) {
  return runAction({ area: "internal", revalidate: ["/staff/signup-requests"], audit: { table: "signup_requests", id: () => id } }, async (tx, user) => {
    const [r] = await tx`select area, status from app.signup_requests where id = ${id} and deleted_at is null`;
    if (!r) throw new UserError("Request not found.");
    if (r.status !== "pending") throw new UserError("This request was already decided.");
    if (r.area === "internal" ? !can(user.perms, "settings", 3) : !can(user.perms, "agents", 5)) throw new UserError("You are not allowed to do this.");
    await tx`update app.signup_requests set status = 'rejected', reason = ${reason.trim() || null}, decided_by = ${user.realUserId}, decided_at = now() where id = ${id}`;
    return { id };
  });
}
