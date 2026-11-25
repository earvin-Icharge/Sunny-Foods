"use server";
import { randomInt } from "node:crypto";
import { runAction, UserError } from "@/lib/actions";
import { asSystem, type Tx } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { can, fieldOn } from "@/lib/perms";

function str(fd: FormData, k: string) { const v = fd.get(k); return v === null || String(v).trim() === "" ? null : String(v).trim(); }
function num(fd: FormData, k: string) { const v = str(fd, k); return v === null ? null : Number(v); }

const PAY_METHODS = ["cash", "cod", "bank_transfer", "gcash", "maya", "cheque"];

/** Create or update a customer (Spec 7.4). Hidden fields are never overwritten. */
export async function saveCustomer(id: string | null, fd: FormData) {
  return runAction({ area: "internal", module: "customers", level: id ? 3 : 2, revalidate: ["/staff/customers"], audit: { table: "customers", id: (d: string) => d } }, async (tx, u) => {
    const row: Record<string, unknown> = {
      name: str(fd, "name"), code: str(fd, "code"), business_type: str(fd, "business_type") ?? "restaurant",
      default_delivery_method: str(fd, "default_delivery_method") ?? "own_truck", notes: str(fd, "notes"),
      allowed_payment_methods: fd.getAll("allowed_payment_methods").map(String).filter((m) => PAY_METHODS.includes(m)),
    };
    if (!row.name) throw new UserError("Name is required.");
    if (fieldOn(u.perms, "customer_contact")) Object.assign(row, { contact_person: str(fd, "contact_person"), phone: str(fd, "phone"), email: str(fd, "email") });
    if (fieldOn(u.perms, "customer_address")) Object.assign(row, { address: str(fd, "address"), lat: num(fd, "lat"), lng: num(fd, "lng") });
    const terms = str(fd, "payment_terms") ?? "cod";
    await checkTerms(tx, id, terms);
    row.payment_terms = terms;
    if (can(u.perms, "customers", 5) && fd.has("price_tier_id")) row.price_tier_id = str(fd, "price_tier_id");
    if (id) {
      await tx`update app.customers set ${tx(row)} where id = ${id}`;
      return id;
    }
    row.status = "approved";
    row.approved_at = new Date();
    row.approved_by = u.id;
    const [r] = await tx`insert into app.customers ${tx(row)} returning id`;
    return String(r.id);
  });
}

async function checkTerms(tx: Tx, id: string | null, terms: string) {
  if (!terms.startsWith("credit_")) return;
  const [old] = id ? await tx`select payment_terms from app.customers where id = ${id}` : [];
  if (old?.payment_terms === terms) return;
  const [r] = await tx`select app.needs_approval('credit_terms') as n`;
  if (r.n) throw new UserError("Only the boss can give credit terms.");
}

/** Approve / reject a pending sign-up (Spec 7.10). */
export async function approveCustomer(id: string, terms: string, tierId: string | null, approve: boolean) {
  return runAction({ area: "internal", module: "customers", level: 3, revalidate: ["/staff/customers", `/staff/customers/${id}`] }, async (tx) => {
    await tx`select app.approve_customer(${id}::uuid, ${terms}, ${tierId}::uuid, ${approve})`;
    return null;
  });
}

export async function setCustomerStatus(id: string, status: "approved" | "suspended") {
  return runAction({ area: "internal", module: "customers", level: 3, revalidate: [`/staff/customers/${id}`], audit: { table: "customers", id: () => id } }, async (tx) => {
    await tx`update app.customers set status = ${status} where id = ${id}`;
    return id;
  });
}

/** Special price per product for this customer — boss only (Spec 7.11). null = remove. */
export async function setSpecialPrice(customerId: string, productId: string, price: number | null) {
  return runAction({ area: "internal", module: "customers", level: 5, revalidate: [`/staff/customers/${customerId}`] }, async (tx) => {
    const [ex] = await tx`select id from app.customer_prices where customer_id = ${customerId} and product_id = ${productId} and deleted_at is null`;
    if (price === null) {
      if (ex) await tx`update app.customer_prices set deleted_at = now() where id = ${ex.id as string}`;
    } else {
      if (!(price >= 0)) throw new UserError("Enter a valid price.");
      if (ex) await tx`update app.customer_prices set price = ${price} where id = ${ex.id as string}`;
      else await tx`insert into app.customer_prices (customer_id, product_id, price) values (${customerId}, ${productId}, ${price})`;
    }
    return null;
  });
}

/** Change the assigned agent — boss only, logged, applies to new orders. */
export async function linkAgent(customerId: string, agentId: string | null) {
  return runAction({ area: "internal", module: "customers", level: 5, revalidate: [`/staff/customers/${customerId}`] }, async (tx) => {
    await tx`select app.link_customer_agent(${customerId}::uuid, ${agentId}::uuid, 'assigned', null)`;
    return null;
  });
}

function tempPassword() {
  const words = ["Sunny", "Steak", "Patty", "Grill", "Pepper", "Ribeye"];
  return `${words[randomInt(words.length)]}-${randomInt(1000, 9999)}-${randomInt(100, 999)}`;
}

/** Create a login (auth user + profile). Returns the temporary password (shown once). */
async function createLogin(opts: { email: string; fullName: string; role: "customer" | "employee"; customerId: string; isEmployee?: boolean; staffProfileId?: string | null; primary?: boolean }) {
  const password = tempPassword();
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email: opts.email, password, email_confirm: true, user_metadata: { full_name: opts.fullName },
  });
  if (error || !data.user) throw new UserError(error?.message?.includes("already") ? "This email already has an account." : "Could not create the login: " + (error?.message ?? ""));
  const uid = data.user.id;
  try {
    await asSystem(async (sys) => {
      await sys`insert into app.profiles (id, full_name, email, role_key, customer_id, is_employee, staff_profile_id, must_change_password)
        values (${uid}, ${opts.fullName}, ${opts.email}, ${opts.role}, ${opts.customerId}, ${opts.isEmployee ?? false}, ${opts.staffProfileId ?? null}, true)`;
      await sys`insert into app.customer_users (customer_id, profile_id, is_primary) values (${opts.customerId}, ${uid}, ${opts.primary ?? false})`;
    });
  } catch (e) {
    await supabaseAdmin().auth.admin.deleteUser(uid);
    throw e;
  }
  return password;
}

/** Add a portal login for a company user (owner + purchaser etc.). */
export async function addPortalUser(customerId: string, fd: FormData) {
  return runAction({ area: "internal", module: "customers", level: 2, revalidate: [`/staff/customers/${customerId}`] }, async (tx) => {
    const email = str(fd, "email")?.toLowerCase();
    const name = str(fd, "full_name");
    if (!email || !name) throw new UserError("Name and email are required.");
    const [c] = await tx`select id, is_employee_account from app.customers where id = ${customerId}`;
    if (!c) throw new UserError("Customer not found.");
    const [n] = await tx`select count(*)::int as n from app.customer_users where customer_id = ${customerId} and deleted_at is null`;
    const password = await createLogin({ email, fullName: name, role: c.is_employee_account ? "employee" : "customer", customerId, primary: Number(n.n) === 0 });
    return { email, password };
  });
}

/** Remove a user's access to this company (login stays in history). */
export async function removePortalUser(customerId: string, profileId: string) {
  return runAction({ area: "internal", module: "customers", level: 3, revalidate: [`/staff/customers/${customerId}`] }, async (tx) => {
    await tx`update app.customer_users set deleted_at = now() where customer_id = ${customerId} and profile_id = ${profileId} and deleted_at is null`;
    await asSystem((sys) => sys`update app.profiles set active = false where id = ${profileId}
      and not exists (select 1 from app.customer_users where profile_id = ${profileId} and deleted_at is null)`);
    return null;
  });
}

/** Employee buyer: a portal account linked to a staff profile, at employee rates (Spec 7.11). */
export async function createEmployeeBuyer(fd: FormData) {
  return runAction({ area: "internal", module: "customers", level: 5, revalidate: ["/staff/customers"] }, async (tx) => {
    const staffId = str(fd, "staff_profile_id");
    const email = str(fd, "email")?.toLowerCase();
    if (!staffId || !email) throw new UserError("Choose the staff member and enter an email.");
    const [staff] = await tx`select p.id, p.full_name, p.phone from app.profiles p join app.roles r on r.key = p.role_key
      where p.id = ${staffId} and r.area = 'internal' and p.active`;
    if (!staff) throw new UserError("Staff member not found.");
    const [dup] = await tx`select id from app.customers where employee_profile_id = ${staffId} and deleted_at is null and status <> 'suspended'`;
    if (dup) throw new UserError("This staff member already has an employee account.");
    const [tier] = await tx`select id from app.price_tiers where key = 'employee'`;
    const [c] = await tx`insert into app.customers (name, business_type, contact_person, phone, email, status, is_employee_account,
        employee_profile_id, price_tier_id, payment_terms, allowed_payment_methods, default_delivery_method, approved_at, approved_by)
      values (${String(staff.full_name) + " (employee)"}, 'employee', ${staff.full_name as string}, ${(staff.phone as string) ?? null}, ${email}, 'approved', true,
        ${staffId}, ${(tier?.id as string) ?? null}, 'cash', array['cash','gcash','maya'], 'pickup', now(), auth.uid())
      returning id`;
    const customerId = String(c.id);
    const amount = num(fd, "monthly_amount");
    if (amount) await tx`insert into app.employee_limits (customer_id, monthly_amount) values (${customerId}, ${amount})`;
    const password = await createLogin({ email, fullName: String(staff.full_name), role: "employee", customerId, isEmployee: true, staffProfileId: staffId, primary: true });
    return { customerId, email, password };
  });
}

export async function saveAddress(customerId: string, id: string | null, fd: FormData) {
  return runAction({ area: "internal", module: "customers", level: 3, revalidate: [`/staff/customers/${customerId}`] }, async (tx) => {
    const row = { label: str(fd, "label") ?? "Main", address: str(fd, "address"), lat: num(fd, "lat"), lng: num(fd, "lng"), is_default: fd.get("is_default") === "on" };
    if (!row.address) throw new UserError("Address is required.");
    if (row.is_default) await tx`update app.customer_addresses set is_default = false where customer_id = ${customerId}`;
    if (id) await tx`update app.customer_addresses set ${tx(row)} where id = ${id} and customer_id = ${customerId}`;
    else await tx`insert into app.customer_addresses ${tx({ ...row, customer_id: customerId })}`;
    return null;
  });
}

export async function removeAddress(customerId: string, id: string) {
  return runAction({ area: "internal", module: "customers", level: 3, revalidate: [`/staff/customers/${customerId}`] }, async (tx) => {
    await tx`update app.customer_addresses set deleted_at = now() where id = ${id} and customer_id = ${customerId}`;
    return null;
  });
}

/** Employee monthly limits: pesos per month and/or packs per product (boss only). */
export async function saveEmployeeLimit(customerId: string, fd: FormData) {
  return runAction({ area: "internal", module: "customers", level: 5, revalidate: [`/staff/customers/${customerId}`] }, async (tx) => {
    const productId = str(fd, "product_id");
    const amount = num(fd, "monthly_amount");
    const packs = num(fd, "monthly_packs");
    if (productId ? !packs : !amount) throw new UserError(productId ? "Enter the packs per month." : "Enter the peso limit per month.");
    const [ex] = productId
      ? await tx`select id from app.employee_limits where customer_id = ${customerId} and product_id = ${productId} and deleted_at is null`
      : await tx`select id from app.employee_limits where customer_id = ${customerId} and product_id is null and deleted_at is null`;
    const row = { customer_id: customerId, product_id: productId, monthly_amount: productId ? null : amount, monthly_packs: productId ? packs : null };
    if (ex) await tx`update app.employee_limits set ${tx(row)} where id = ${ex.id as string}`;
    else await tx`insert into app.employee_limits ${tx(row)}`;
    return null;
  });
}

export async function removeEmployeeLimit(customerId: string, id: string) {
  return runAction({ area: "internal", module: "customers", level: 5, revalidate: [`/staff/customers/${customerId}`] }, async (tx) => {
    await tx`update app.employee_limits set deleted_at = now() where id = ${id} and customer_id = ${customerId}`;
    return null;
  });
}

