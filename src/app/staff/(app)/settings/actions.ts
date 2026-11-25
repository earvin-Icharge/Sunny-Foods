"use server";
import { runAction, UserError } from "@/lib/actions";
import { asSystem } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadBuffer } from "@/lib/storage";

const NUM_KEYS = ["vat_rate", "min_order_amount", "expiry_alert_days", "agent_portal_readonly_days", "voucher_attempt_limit"];
const BOOL_KEYS = ["prices_include_vat", "discount_before_vat", "delivery_fee_vatable"];
const TEXT_KEYS = ["receipt_footer", "pickup_address"];

/** General settings (Spec 7.5 VAT/D4, 7.10 delivery rules, company info on documents). */
export async function saveGeneralSettings(fd: FormData) {
  return runAction({ area: "internal", module: "settings", level: 3, revalidate: ["/staff/settings/general"] }, async (tx) => {
    const values: Record<string, unknown> = {};
    for (const k of NUM_KEYS) {
      const v = fd.get(k);
      if (v === null || v === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new UserError(`Invalid number: ${k}`);
      values[k] = k === "vat_rate" ? n / 100 : n;
    }
    for (const k of BOOL_KEYS) values[k] = fd.get(k) === "on";
    for (const k of TEXT_KEYS) values[k] = String(fd.get(k) ?? "");
    values.delivery_fees = {
      own_truck: Number(fd.get("fee_own_truck") || 0), courier: Number(fd.get("fee_courier") || 0), pickup: Number(fd.get("fee_pickup") || 0),
    };
    const free = String(fd.get("free_delivery_over") ?? "").trim();
    values.free_delivery_over = free === "" ? null : Number(free);
    values.no_delivery_weekdays = fd.getAll("no_delivery_weekdays").map((x) => Number(x));
    values.time_windows = String(fd.get("time_windows") ?? "").split(/\n|,/).map((s) => s.trim()).filter(Boolean);
    values.company = {
      name: String(fd.get("company_name") ?? ""), address: String(fd.get("company_address") ?? ""), tin: String(fd.get("company_tin") ?? ""),
      phone: String(fd.get("company_phone") ?? ""), email: String(fd.get("company_email") ?? ""),
    };
    for (const [key, value] of Object.entries(values)) {
      const json = tx.json(value as never);
      const r = await tx`update app.app_settings set value = ${json} where key = ${key} returning id`;
      if (!r.length) await tx`insert into app.app_settings (key, value) values (${key}, ${json})`;
    }
    return null;
  });
}

export async function addBlockedDate(day: string, reason: string) {
  return runAction({ area: "internal", module: "settings", level: 3, revalidate: ["/staff/settings/general"] }, async (tx) => {
    if (!day) throw new UserError("Choose a date.");
    await tx`insert into app.blocked_delivery_dates (date, reason) values (${day}::date, ${reason || null})`;
    return null;
  });
}

export async function removeBlockedDate(id: string) {
  return runAction({ area: "internal", module: "settings", level: 3, revalidate: ["/staff/settings/general"] }, async (tx) => {
    await tx`update app.blocked_delivery_dates set deleted_at = now() where id = ${id}`;
    return null;
  });
}

/** Data Privacy Act requests (Spec 7.10, 8.13). */
export async function decideDataRequest(id: string, approve: boolean) {
  return runAction({ area: "internal", module: "settings", level: 5, revalidate: ["/staff/settings/data-requests"] }, async (tx) => {
    const [r] = await tx`select * from app.data_requests where id = ${id} and status = 'pending'`;
    if (!r) throw new UserError("Request not found.");
    if (!approve) {
      await tx`select app.decide_data_request(${id}::uuid, false, null)`;
      return null;
    }
    const profileId = String(r.profile_id);
    if (r.kind === "copy") {
      // Build the person's data copy as the system and store it privately.
      const exportData = await asSystem(async (s) => {
        const [profile] = await s`select id, full_name, email, phone, role_key, language, created_at from app.profiles where id = ${profileId}`;
        const customerIds = (await s`select customer_id from app.customer_users where profile_id = ${profileId}`).map((x) => String(x.customer_id));
        if (r.customer_id) customerIds.push(String(r.customer_id));
        const customers = await s`select id, name, business_type, contact_person, phone, email, address, lat, lng, payment_terms, status, created_at
          from app.customers where id = any(${customerIds}::uuid[])`;
        const addresses = await s`select label, address, lat, lng from app.customer_addresses where customer_id = any(${customerIds}::uuid[]) and deleted_at is null`;
        const orders = await s`select order_no, status, created_at, delivery_date, delivery_method, delivery_address, payment_method, payment_status, total
          from app.orders where customer_id = any(${customerIds}::uuid[]) and deleted_at is null order by created_at`;
        const payments = await s`select p.paid_at, p.amount, p.method, p.reference from app.payments p where p.customer_id = any(${customerIds}::uuid[]) and p.deleted_at is null`;
        const consents = await s`select policy_version, consented_at from app.privacy_consents where profile_id = ${profileId}`;
        const agent = r.agent_id ? await s`select name, type, phone, email, payout_method, payout_name, referral_code, status from app.agents where id = ${String(r.agent_id)}` : [];
        const commissions = r.agent_id ? await s`select cm.created_at, o.order_no, cm.amount, cm.status from app.commissions cm join app.orders o on o.id = cm.order_id where cm.agent_id = ${String(r.agent_id)}` : [];
        return { generated_at: new Date().toISOString(), profile, customers, addresses, orders, payments, consents, agent: agent[0] ?? null, commissions };
      });
      const path = await uploadBuffer(Buffer.from(JSON.stringify(exportData, null, 2)), `data-exports/${id}.json`, "application/json");
      await tx`select app.decide_data_request(${id}::uuid, true, ${path})`;
    } else {
      await tx`select app.decide_data_request(${id}::uuid, true, null)`;
      // Disable the login (soft delete keeps the auth row; personal details already blanked).
      const { error } = await supabaseAdmin().auth.admin.deleteUser(profileId, true);
      if (error) console.error("auth soft delete failed", error.message);
    }
    return null;
  });
}
