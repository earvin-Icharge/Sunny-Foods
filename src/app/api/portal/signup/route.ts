import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { asSystem } from "@/lib/db";
import { env } from "@/lib/env";
import { clientIp, createCustomerRecords, readCustomerForm } from "@/lib/customer-signup";
import { json } from "../_lib/server";

/**
 * Customer sign-up with email + password (kept for the store app, Spec 9a).
 * The web/APK portal now offers Google, Facebook, phone code and email code (D1, 2026-11-26).
 * Email verification + Pending until Sunny Foods approves.
 * Abuse guards (Spec 8.10): hidden honeypot field, max 5 sign-ups per IP per hour.
 */
export async function POST(req: NextRequest) {
  const fd = await req.formData();
  if (String(fd.get("website") ?? "").trim()) return json({ ok: true }); // honeypot
  const ip = clientIp(req.headers);
  const password = String(fd.get("password") ?? "");
  const { errors, details } = readCustomerForm(fd, {});
  if (!details.email) errors.push("email");
  if (password.length < 8) errors.push("password");
  if (errors.length) return json({ ok: false, errors }, 400);
  const email = details.email as string;

  const [{ n }] = await asSystem((tx) => tx`select count(*)::int as n from app.signup_attempts where ip = ${ip} and at > now() - interval '1 hour'`);
  if (Number(n) >= 5) return json({ ok: false, errors: ["too_many"] }, 429);
  await asSystem((tx) => tx`insert into app.signup_attempts (ip, email) values (${ip}, ${email})`);

  const origin = req.headers.get("origin") ?? req.nextUrl.origin;
  const sb = createClient(env.supabaseUrl, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${origin}/api/auth/confirm?next=/portal`, data: { full_name: details.contact } },
  });
  if (error) return json({ ok: false, errors: [error.message.toLowerCase().includes("password") ? "password" : "signup_failed"] }, 400);
  const userId = data.user?.id;
  // Existing email: Supabase hides it (no identities) — show the same message, create nothing.
  if (!userId || (data.user?.identities && data.user.identities.length === 0)) return json({ ok: true });

  try {
    await createCustomerRecords(userId, {
      ...details, language: (await cookies()).get("NEXT_LOCALE")?.value, ip, userAgent: req.headers.get("user-agent"),
    });
  } catch (e) {
    console.error("signup records failed", e);
    return json({ ok: false, errors: ["signup_failed"] }, 500);
  }
  return json({ ok: true });
}
