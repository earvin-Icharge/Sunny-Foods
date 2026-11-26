import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "./supabase/server";
import { asUser } from "./db";
import { env } from "./env";
import { AREAS, type Area } from "./areas";
import { MODULES, FIELDS, type Module, type Perms } from "./perms";

export type SessionUser = {
  id: string;            // the user whose data we show (the viewed user during "View as")
  realUserId: string;    // the person actually logged in
  viewAs: boolean;       // read-only preview by the owner (Master Control)
  email: string | null;
  fullName: string;
  roleKey: string;
  roleName: string;
  area: Area;
  language: string;
  customerId: string | null;
  agentId: string | null;
  isEmployee: boolean;
  mustChangePassword: boolean;
  perms: Perms;
};

async function loadUser(userId: string): Promise<Omit<SessionUser, "realUserId" | "viewAs"> | null> {
  return asUser(userId, async (tx) => {
    const [p] = await tx`
      select p.id, p.email, p.full_name, p.role_key, p.language, p.customer_id, p.agent_id, p.is_employee,
             p.must_change_password, r.area, r.name as role_name
      from app.profiles p join app.roles r on r.key = p.role_key
      where p.id = ${userId} and p.active and p.deleted_at is null and r.active`;
    if (!p) return null;
    const levels = await tx`select m, app.perm(m)::int as level, app.scope(m) as scope from unnest(${MODULES as unknown as string[]}::text[]) m`;
    const fields = await tx`select f, app.field(f) as value from unnest(${FIELDS as unknown as string[]}::text[]) f`;
    const perms: Perms = { modules: {} as Perms["modules"], fields: {} };
    for (const l of levels) perms.modules[l.m as Module] = { level: Number(l.level), scope: String(l.scope) as "own" | "team" | "all" };
    for (const f of fields) perms.fields[String(f.f)] = String(f.value);
    // portal customer: pick first linked company if profile has none
    let customerId = (p.customer_id as string | null) ?? null;
    if (!customerId && p.area === "portal") {
      const [cu] = await tx`select customer_id from app.customer_users where profile_id = ${userId} and deleted_at is null order by is_primary desc limit 1`;
      customerId = (cu?.customer_id as string) ?? null;
    }
    return {
      id: String(p.id), email: (p.email as string) ?? null, fullName: String(p.full_name ?? ""),
      roleKey: String(p.role_key), roleName: String(p.role_name), area: p.area as Area, language: String(p.language),
      customerId, agentId: (p.agent_id as string) ?? null, isEmployee: Boolean(p.is_employee),
      mustChangePassword: Boolean(p.must_change_password), perms,
    };
  });
}

/** Verified user id from the Supabase session cookie, or a Bearer token (store app). */
async function verifiedUserId(): Promise<string | null> {
  const h = await headers();
  const bearer = h.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) {
    const sb = createClient(env.supabaseUrl, env.publishableKey, { auth: { persistSession: false } });
    const { data } = await sb.auth.getClaims(bearer);
    return (data?.claims?.sub as string) ?? null;
  }
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string) ?? null;
}

/**
 * The signed-in login itself (even before it has a Sunny Foods profile):
 * used by sign-up steps — the customer "business details" form and the
 * staff/agent "waiting for approval" check.
 */
export async function getAuthClaims(): Promise<{ id: string; email: string | null; phone: string | null; name: string | null } | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims as Record<string, unknown> | undefined;
  if (!c?.sub) return null;
  const meta = (c.user_metadata ?? {}) as Record<string, unknown>;
  const name = (meta.full_name ?? meta.name ?? null) as string | null;
  return { id: String(c.sub), email: (c.email as string) || null, phone: (c.phone as string) || null, name };
}

/** The current user (cached per request). Handles the owner's "View as" preview. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const realId = await verifiedUserId();
  if (!realId) return null;
  const real = await loadUser(realId);
  if (!real) return null;
  const viewAsId = (await cookies()).get("sf_view_as")?.value;
  if (viewAsId && viewAsId !== realId && real.area === "internal" && real.perms.modules.settings?.level >= 5) {
    const target = await loadUser(viewAsId);
    if (target) return { ...target, realUserId: realId, viewAs: true };
  }
  return { ...real, realUserId: realId, viewAs: false };
});

/** For pages: must be logged in to this area, else go to its login page. */
export async function requireArea(area: Area): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect(`${AREAS[area].prefix}/login`);
  // Owner previewing someone ("View as") opened a page of another area: end the preview.
  if (s.viewAs && s.area !== area) redirect("/staff/settings/master-control/stop");
  if (s.area !== area) redirect(`${AREAS[area].prefix}/not-allowed`);
  return s;
}

/** For pages: needs a module permission level. */
export async function requirePerm(area: Area, module: Module, level = 1): Promise<SessionUser> {
  const s = await requireArea(area);
  if ((s.perms.modules[module]?.level ?? 0) < level) redirect(`${AREAS[area].prefix}/not-allowed`);
  return s;
}
