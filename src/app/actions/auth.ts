"use server";
import { cookies } from "next/headers";
import { getAuthClaims, getSession } from "@/lib/auth";
import { asSystem } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";
import type { Area } from "@/lib/areas";

export type AfterLogin = { ok: boolean; error?: string; mustChangePassword?: boolean; next?: string };

/**
 * After any login (password, code, Google, Facebook): make sure this account belongs
 * to this app, and apply its language.
 * - No profile yet + customer app  -> "needs_onboarding" (business details form).
 * - No profile yet + staff/agent   -> sign-up request: waiting for the boss, or rejected.
 */
export async function afterLogin(area: Area): Promise<AfterLogin> {
  const s = await getSession();
  if (!s) return noProfile(area);
  if (s.area !== area) {
    const sb = await supabaseServer();
    await sb.auth.signOut();
    return { ok: false, error: "wrong_app" };
  }
  (await cookies()).set("NEXT_LOCALE", s.language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return { ok: true, mustChangePassword: s.mustChangePassword };
}

async function noProfile(area: Area): Promise<AfterLogin> {
  const claims = await getAuthClaims();
  if (!claims) return { ok: false, error: "account_not_ready" };
  const [row] = await asSystem((tx) => tx`select
      exists (select 1 from app.profiles where id = ${claims.id}) as has_profile,
      app.signup_confirmed(${claims.id}) as request_status`);
  const sb = await supabaseServer();
  if (row.request_status === "pending") { await sb.auth.signOut(); return { ok: false, error: "awaiting_approval" }; }
  if (row.request_status === "rejected") { await sb.auth.signOut(); return { ok: false, error: "signup_rejected" }; }
  // A brand-new customer login (Google, Facebook, phone or email code): ask for business details.
  if (area === "portal" && !row.has_profile && row.request_status === null) return { ok: false, error: "needs_onboarding", next: "/portal/welcome" };
  await sb.auth.signOut();
  return { ok: false, error: "account_not_ready" };
}
