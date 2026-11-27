"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthClaims } from "@/lib/auth";
import { asSystem } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";
import { AREAS, type Area } from "@/lib/areas";

export type AfterLogin = { ok: boolean; error?: string; mustChangePassword?: boolean; next?: string };
export type LoginState = { error?: string; code?: "confirm"; email?: string; at?: number } | null;

/**
 * Is this login allowed into this app? Applies its language when it is.
 * - Profile in another app            -> "wrong_app"
 * - No profile + customer app         -> "needs_onboarding" (business details form)
 * - No profile + staff/agent sign-up  -> waiting for the boss, or rejected
 */
async function checkAccount(userId: string, area: Area): Promise<AfterLogin> {
  const [p] = await asSystem((tx) => tx`select p.active and r.active as active, p.deleted_at is not null as deleted, p.language, p.must_change_password, r.area
    from app.profiles p join app.roles r on r.key = p.role_key where p.id = ${userId}`);
  if (p) {
    if (!p.active || p.deleted) return { ok: false, error: "account_not_ready" };
    if (p.area !== area) return { ok: false, error: "wrong_app" };
    (await cookies()).set("NEXT_LOCALE", String(p.language), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return { ok: true, mustChangePassword: Boolean(p.must_change_password) };
  }
  const [row] = await asSystem((tx) => tx`select app.signup_confirmed(${userId}) as request_status`);
  if (row.request_status === "pending") return { ok: false, error: "awaiting_approval" };
  if (row.request_status === "rejected") return { ok: false, error: "signup_rejected" };
  if (area === "portal" && row.request_status === null) return { ok: false, error: "needs_onboarding", next: "/portal/welcome" };
  return { ok: false, error: "account_not_ready" };
}

/** After a login done in the browser (email code, phone code, Google, Facebook, sign-up code). */
export async function afterLogin(area: Area): Promise<AfterLogin> {
  const claims = await getAuthClaims();
  if (!claims) return { ok: false, error: "account_not_ready" };
  const r = await checkAccount(claims.id, area);
  if (!r.ok && !r.next) await (await supabaseServer()).auth.signOut();
  return r;
}

/**
 * Email + password login done ON THE SERVER (works on slow phones, old browsers and
 * in-app browsers — the login cookie comes from the server, and the form works even
 * before the page script has loaded). "?li=1" lets proxy.ts check that the phone
 * really kept the login, and explain it if not.
 */
export async function passwordLogin(area: Area, _prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "wrongPassword", at: Date.now() };
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed" || /confirm/i.test(error?.message ?? "")) return { code: "confirm", email, at: Date.now() };
    if (error?.status === 429) return { error: "tooManyAttempts", at: Date.now() };
    return { error: "wrongPassword", at: Date.now() };
  }
  const r = await checkAccount(data.user.id, area);
  if (!r.ok && !r.next) {
    await sb.auth.signOut();
    return { error: r.error ?? "wrongApp", at: Date.now() };
  }
  const prefix = AREAS[area].prefix;
  const next = r.next ?? (r.mustChangePassword ? `${prefix}/reset-password?first=1` : prefix);
  redirect(`${next}${next.includes("?") ? "&" : "?"}li=1`);
}
