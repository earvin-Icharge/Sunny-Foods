"use server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { asSystem } from "@/lib/db";
import { env } from "@/lib/env";
import { AREAS } from "@/lib/areas";

type TeamArea = "internal" | "agent";
export type TeamSignupResult = { ok: boolean; errors?: string[] };

/**
 * Staff / agent self sign-up (decision D1, 2026-11-26).
 * Creates the login (email code confirmation) and a sign-up request.
 * No profile is made here: the person stays locked until the boss approves.
 * Abuse guards: hidden honeypot field, max 5 sign-ups per IP per hour (Spec 8.10).
 */
export async function teamSignup(area: TeamArea, fd: FormData): Promise<TeamSignupResult> {
  if (area !== "internal" && area !== "agent") return { ok: false, errors: ["signup_failed"] };
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  if (s("website")) return { ok: true }; // honeypot
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";

  const email = s("email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const name = s("full_name");
  const errors: string[] = [];
  if (!name) errors.push("full_name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("email");
  if (password.length < 8) errors.push("password");
  if (!s("phone")) errors.push("phone");
  if (fd.get("consent") !== "on") errors.push("consent");
  if (errors.length) return { ok: false, errors };

  const [{ n }] = await asSystem((tx) => tx`select count(*)::int as n from app.signup_attempts where ip = ${ip} and at > now() - interval '1 hour'`);
  if (Number(n) >= 5) return { ok: false, errors: ["too_many"] };
  await asSystem((tx) => tx`insert into app.signup_attempts (ip, email) values (${ip}, ${email})`);

  const origin = h.get("origin") ?? "";
  const sb = createClient(env.supabaseUrl, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${origin}/api/auth/confirm?next=${AREAS[area].prefix}/login`, data: { full_name: name } },
  });
  if (error) return { ok: false, errors: [error.message.toLowerCase().includes("password") ? "password" : "signup_failed"] };
  const userId = data.user?.id;
  // Existing email: Supabase hides it (no identities) — same answer, nothing created.
  if (!userId || (data.user?.identities && data.user.identities.length === 0)) return { ok: true };

  const agentType = s("agent_type") === "broker" ? "broker" : "agent";
  await asSystem((tx) => tx`insert into app.signup_requests (user_id, area, full_name, email, phone, note, agent_type, ip)
    values (${userId}, ${area}, ${name}, ${email}, ${s("phone")}, ${s("note") || null}, ${area === "agent" ? agentType : null}, ${ip})
    on conflict (user_id) do nothing`);
  return { ok: true };
}
