"use server";
import { runAction, UserError } from "@/lib/actions";
import { can } from "@/lib/perms";

function str(fd: FormData, k: string) { const v = fd.get(k); return v === null || String(v).trim() === "" ? null : String(v).trim(); }

/**
 * Boss approves a staff / agent sign-up (decision D1, 2026-11-26): picks the role
 * (and team / commission), which creates their profile so they can log in.
 * Staff requests need Settings level 3, agent requests need Agents level 5
 * (the same rights as creating those accounts by hand).
 */
export async function approveSignup(id: string, fd: FormData) {
  return runAction({ area: "internal", revalidate: ["/staff/signup-requests", "/staff/settings/users", "/staff/agents"], audit: { table: "signup_requests", id: () => id } }, async (tx, user) => {
    const [r] = await tx`select area, agent_type from app.signup_requests where id = ${id} and deleted_at is null`;
    if (!r) throw new UserError("Request not found.");
    if (r.area === "internal" ? !can(user.perms, "settings", 3) : !can(user.perms, "agents", 5)) throw new UserError("You are not allowed to do this.");
    const roleKey = str(fd, "role_key") ?? (r.area === "agent" ? String(r.agent_type ?? "agent") : null);
    if (!roleKey) throw new UserError("Choose a role.");
    // One database step: profile (+ agent record) + privacy consent + decision (0018).
    await tx`select app.approve_signup(${id}::uuid, ${roleKey}, ${str(fd, "team_id")}::uuid,
      ${str(fd, "default_rate_kind") ?? "percent"}, ${Number(str(fd, "default_rate") ?? 0)}::numeric)`;
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
