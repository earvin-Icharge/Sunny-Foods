import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAuthClaims } from "@/lib/auth";
import { asSystem } from "@/lib/db";
import { clientIp, createCustomerRecords, readCustomerForm } from "@/lib/customer-signup";
import { json } from "../_lib/server";

/**
 * Business details after a first customer login with Google, Facebook, phone code or
 * email code (decision D1, 2026-11-26). The login already proved the email / phone;
 * the customer stays Pending until Sunny Foods approves (Spec 7.10).
 */
export async function POST(req: NextRequest) {
  const claims = await getAuthClaims();
  if (!claims) return json({ ok: false, errors: ["login_again"] }, 401);
  const fd = await req.formData();
  if (String(fd.get("website") ?? "").trim()) return json({ ok: true }); // honeypot
  // The proven email / phone always win over typed ones.
  const { errors, details } = readCustomerForm(fd, { email: claims.email, phone: claims.phone ? "+" + claims.phone.replace(/^\+/, "") : null });
  if (claims.email) details.email = claims.email.toLowerCase();
  if (errors.length) return json({ ok: false, errors }, 400);
  const [req0] = await asSystem((tx) => tx`select 1 from app.signup_requests where user_id = ${claims.id}`);
  if (req0) return json({ ok: false, errors: ["signup_failed"] }, 400); // a staff/agent sign-up, not a customer
  try {
    const jar = await cookies();
    await createCustomerRecords(claims.id, { ...details, language: jar.get("NEXT_LOCALE")?.value, ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") });
    jar.delete("sf_ref");
  } catch (e) {
    console.error("onboard records failed", e);
    return json({ ok: false, errors: ["signup_failed"] }, 500);
  }
  return json({ ok: true });
}
