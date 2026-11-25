import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { asSystem } from "@/lib/db";
import { env } from "@/lib/env";
import { uploadFile } from "@/lib/storage";
import { isLocale } from "@/i18n/config";
import { json } from "../_lib/server";

const TYPES = ["restaurant", "cafe", "retailer", "distributor", "private_label", "other"];

/**
 * Customer sign-up (Spec 7.10): email verification + Pending until Sunny Foods approves.
 * Abuse guards (Spec 8.10): hidden honeypot field, max 5 sign-ups per IP per hour.
 * Multipart form so the business permit photo/PDF can be attached.
 */
export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  if (s("website")) return json({ ok: true }); // honeypot: bots fill hidden fields
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";

  const email = s("email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const business = s("business_name");
  const contact = s("contact_person");
  const errors: string[] = [];
  if (!business) errors.push("business_name");
  if (!contact) errors.push("contact_person");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("email");
  if (password.length < 8) errors.push("password");
  if (!s("phone")) errors.push("phone");
  if (!s("address")) errors.push("address");
  if (fd.get("consent") !== "on") errors.push("consent");
  if (errors.length) return json({ ok: false, errors }, 400);

  const [{ n }] = await asSystem((tx) => tx`select count(*)::int as n from app.signup_attempts where ip = ${ip} and at > now() - interval '1 hour'`);
  if (Number(n) >= 5) return json({ ok: false, errors: ["too_many"] }, 429);
  await asSystem((tx) => tx`insert into app.signup_attempts (ip, email) values (${ip}, ${email})`);

  const origin = req.headers.get("origin") ?? req.nextUrl.origin;
  const sb = createClient(env.supabaseUrl, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${origin}/api/auth/confirm?next=/portal`, data: { full_name: contact } },
  });
  if (error) return json({ ok: false, errors: [error.message.toLowerCase().includes("password") ? "password" : "signup_failed"] }, 400);
  const userId = data.user?.id;
  // Existing email: Supabase hides it (no identities) — show the same message, create nothing.
  if (!userId || (data.user?.identities && data.user.identities.length === 0)) return json({ ok: true });

  const permit = fd.get("permit");
  const lang = (await cookies()).get("NEXT_LOCALE")?.value;
  const language = isLocale(lang) ? lang : "en";
  const type = TYPES.includes(s("business_type")) ? s("business_type") : "other";
  const lat = s("lat") ? Number(s("lat")) : null;
  const lng = s("lng") ? Number(s("lng")) : null;
  try {
    await asSystem(async (tx) => {
      const [exists] = await tx`select id from app.profiles where id = ${userId}`;
      if (exists) return;
      const [c] = await tx`insert into app.customers (name, business_type, contact_person, phone, email, address, lat, lng, status, referral_code_used, created_by)
        values (${business}, ${type}, ${contact}, ${s("phone")}, ${email}, ${s("address")}, ${lat}, ${lng}, 'pending',
                ${s("referral_code").toUpperCase() || null}, ${userId}) returning id`;
      const customerId = String(c.id);
      await tx`insert into app.customer_addresses (customer_id, label, address, lat, lng, is_default, created_by)
        values (${customerId}, 'Main', ${s("address")}, ${lat}, ${lng}, true, ${userId})`;
      await tx`insert into app.profiles (id, full_name, email, phone, role_key, language, customer_id, created_by)
        values (${userId}, ${contact}, ${email}, ${s("phone")}, 'customer', ${language}, ${customerId}, ${userId})`;
      await tx`insert into app.customer_users (customer_id, profile_id, is_primary, created_by) values (${customerId}, ${userId}, true, ${userId})`;
      await tx`insert into app.privacy_consents (profile_id, policy_version, ip, user_agent)
        values (${userId}, coalesce(app.setting('privacy_policy_version') #>> '{}', 'unknown'), ${ip}, ${req.headers.get("user-agent")?.slice(0, 300) ?? null})`;
      if (permit instanceof Blob && permit.size > 0) {
        const path = await uploadFile(permit, `permits/${customerId}`);
        await tx`update app.customers set permit_path = ${path} where id = ${customerId}`;
      }
      await tx`select app.notify_staff('customers', 3::smallint, 'new_customer', ${"New customer sign-up: " + business}, ${contact},
        ${"/customers/" + customerId}, ${tx.json({ customer_id: customerId })})`;
    });
  } catch (e) {
    console.error("signup records failed", e);
    return json({ ok: false, errors: ["signup_failed"] }, 500);
  }
  return json({ ok: true });
}
