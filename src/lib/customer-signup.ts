import "server-only";
import { asSystem } from "./db";
import { uploadFile } from "./storage";
import { isLocale } from "@/i18n/config";

const TYPES = ["restaurant", "cafe", "retailer", "distributor", "private_label", "other"];

export type CustomerDetails = {
  business: string; businessType: string; contact: string; phone: string; email: string | null; address: string;
  lat: number | null; lng: number | null; referral: string | null; permit: FormDataEntryValue | null;
  language: string | undefined; ip: string; userAgent: string | null;
};

/** Read + check the business-details form (Spec 7.10). Returns the missing fields. */
export function readCustomerForm(fd: FormData, extra: { email?: string | null; phone?: string | null }) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const email = (s("email") || extra.email || "").toLowerCase() || null;
  const phone = s("phone") || extra.phone || "";
  const errors: string[] = [];
  if (!s("business_name")) errors.push("business_name");
  if (!s("contact_person")) errors.push("contact_person");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("email");
  if (!phone) errors.push("phone");
  if (!s("address")) errors.push("address");
  if (fd.get("consent") !== "on") errors.push("consent");
  return {
    errors,
    details: {
      business: s("business_name"), businessType: TYPES.includes(s("business_type")) ? s("business_type") : "other",
      contact: s("contact_person"), phone, email, address: s("address"),
      lat: s("lat") ? Number(s("lat")) : null, lng: s("lng") ? Number(s("lng")) : null,
      referral: s("referral_code").toUpperCase() || null, permit: fd.get("permit"),
    },
  };
}

/**
 * Create the customer (Pending until Sunny Foods approves), its main address, the login's
 * profile, the privacy consent, and tell the staff. Used by every customer sign-up way
 * (email + password, email code, phone code, Google, Facebook).
 */
export async function createCustomerRecords(userId: string, d: CustomerDetails): Promise<string | null> {
  const language = isLocale(d.language) ? d.language : "en";
  return asSystem(async (tx) => {
    const [exists] = await tx`select id from app.profiles where id = ${userId}`;
    if (exists) return null;
    const [c] = await tx`insert into app.customers (name, business_type, contact_person, phone, email, address, lat, lng, status, referral_code_used, created_by)
      values (${d.business}, ${d.businessType}, ${d.contact}, ${d.phone}, ${d.email}, ${d.address}, ${d.lat}, ${d.lng}, 'pending',
              ${d.referral}, ${userId}) returning id`;
    const customerId = String(c.id);
    await tx`insert into app.customer_addresses (customer_id, label, address, lat, lng, is_default, created_by)
      values (${customerId}, 'Main', ${d.address}, ${d.lat}, ${d.lng}, true, ${userId})`;
    await tx`insert into app.profiles (id, full_name, email, phone, role_key, language, customer_id, created_by)
      values (${userId}, ${d.contact}, ${d.email}, ${d.phone}, 'customer', ${language}, ${customerId}, ${userId})`;
    await tx`insert into app.customer_users (customer_id, profile_id, is_primary, created_by) values (${customerId}, ${userId}, true, ${userId})`;
    await tx`insert into app.privacy_consents (profile_id, policy_version, ip, user_agent)
      values (${userId}, coalesce(app.setting('privacy_policy_version') #>> '{}', 'unknown'), ${d.ip}, ${d.userAgent?.slice(0, 300) ?? null})`;
    if (d.permit instanceof Blob && d.permit.size > 0) {
      const path = await uploadFile(d.permit, `permits/${customerId}`);
      await tx`update app.customers set permit_path = ${path} where id = ${customerId}`;
    }
    await tx`select app.notify_staff('customers', 3::smallint, 'new_customer', ${"New customer sign-up: " + d.business}, ${d.contact},
      ${"/customers/" + customerId}, ${tx.json({ customer_id: customerId })})`;
    return customerId;
  });
}

export function clientIp(h: Headers) {
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}
