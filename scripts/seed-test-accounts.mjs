// Creates ONE test login per role (Spec 12, Phase 1). Safe to run again: no duplicates,
// existing test logins just get a fresh password (printed at the end).
//
//   node --env-file=.env.local scripts/seed-test-accounts.mjs
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!url || !secret || !dbUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY or DATABASE_URL in .env.local");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = postgres(dbUrl, { prepare: false, max: 1 });

const ROLES = [
  { role: "owner", name: "Test Owner" },
  { role: "admin", name: "Test Admin" },
  { role: "office", name: "Test Office" },
  { role: "warehouse", name: "Test Warehouse" },
  { role: "driver", name: "Test Driver" },
  { role: "customer", name: "Test Customer" },
  { role: "employee", name: "Test Employee Buyer" },
  { role: "agent", name: "Test Agent" },
  { role: "broker", name: "Test Broker" },
];
const email = (role) => `test+${role}@sunnyfoods.com.ph`;
const newPassword = () => "Sf-" + randomBytes(6).toString("base64url");

async function findAuthUser(mail) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === mail);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureLogin(role, name) {
  const mail = email(role);
  const password = newPassword();
  let user = await findAuthUser(mail);
  if (user) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, ban_duration: "none" });
    if (error) throw error;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: mail, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    user = data.user;
  }
  return { id: user.id, email: mail, password };
}

async function ensureProfile(id, role, name, extra = {}) {
  const [p] = await sql`select id from app.profiles where id = ${id}`;
  if (p) {
    await sql`update app.profiles set role_key = ${role}, active = true, full_name = ${name},
      customer_id = ${extra.customer_id ?? null}, agent_id = ${extra.agent_id ?? null}, is_employee = ${extra.is_employee ?? false},
      staff_profile_id = ${extra.staff_profile_id ?? null} where id = ${id}`;
  } else {
    await sql`insert into app.profiles (id, full_name, email, role_key, customer_id, agent_id, is_employee, staff_profile_id)
      values (${id}, ${name}, ${email(role)}, ${role}, ${extra.customer_id ?? null}, ${extra.agent_id ?? null},
              ${extra.is_employee ?? false}, ${extra.staff_profile_id ?? null})`;
  }
}

async function ensureCustomer(code, name, opts) {
  const [c] = await sql`select id from app.customers where code = ${code}`;
  if (c) return c.id;
  const [tier] = await sql`select id from app.price_tiers where key = ${opts.tier}`;
  const [r] = await sql`insert into app.customers (code, name, business_type, contact_person, address, status, price_tier_id,
      is_employee_account, payment_terms, allowed_payment_methods, approved_at)
    values (${code}, ${name}, ${opts.type}, ${opts.contact}, 'Carmona, Cavite', 'approved', ${tier?.id ?? null},
      ${opts.employee ?? false}, 'cod', ${opts.methods}, now()) returning id`;
  return r.id;
}

async function ensureAgent(code, name, type) {
  const [a] = await sql`select id from app.agents where referral_code = ${code}`;
  if (a) return a.id;
  const [r] = await sql`insert into app.agents (name, type, role_key, referral_code, default_rate, email)
    values (${name}, ${type}, ${type}, ${code}, 5, ${email(type)}) returning id`;
  return r.id;
}

async function linkUser(customerId, profileId) {
  const [x] = await sql`select id from app.customer_users where customer_id = ${customerId} and profile_id = ${profileId} and deleted_at is null`;
  if (!x) await sql`insert into app.customer_users (customer_id, profile_id, is_primary) values (${customerId}, ${profileId}, true)`;
}

const out = [];
try {
  const logins = {};
  for (const r of ROLES) logins[r.role] = await ensureLogin(r.role, r.name);

  for (const r of ["owner", "admin", "office", "warehouse", "driver"]) await ensureProfile(logins[r].id, r, ROLES.find((x) => x.role === r).name);

  const custId = await ensureCustomer("TEST-CAFE", "Test Cafe (demo)", { tier: "regular", type: "cafe", contact: "Test Customer", methods: ["cash", "cod", "bank_transfer", "gcash", "maya"] });
  await ensureProfile(logins.customer.id, "customer", "Test Customer", { customer_id: custId });
  await linkUser(custId, logins.customer.id);

  const empId = await ensureCustomer("TEST-EMPLOYEE", "Test Employee Buyer", { tier: "employee", type: "employee", contact: "Test Employee Buyer", employee: true, methods: ["cash", "gcash", "maya"] });
  await sql`update app.customers set employee_profile_id = ${logins.office.id} where id = ${empId}`;
  await ensureProfile(logins.employee.id, "employee", "Test Employee Buyer", { customer_id: empId, is_employee: true, staff_profile_id: logins.office.id });
  await linkUser(empId, logins.employee.id);
  const [lim] = await sql`select id from app.employee_limits where customer_id = ${empId} and product_id is null and deleted_at is null`;
  if (!lim) await sql`insert into app.employee_limits (customer_id, monthly_amount) values (${empId}, 5000)`;

  for (const type of ["agent", "broker"]) {
    const agentId = await ensureAgent(type === "agent" ? "TEST-AGENT" : "TEST-BROKER", ROLES.find((x) => x.role === type).name, type);
    await ensureProfile(logins[type].id, type, ROLES.find((x) => x.role === type).name, { agent_id: agentId });
    await sql`update app.agents set profile_id = ${logins[type].id} where id = ${agentId}`;
    if (type === "agent") {
      const [l] = await sql`select id from app.agent_customers where agent_id = ${agentId} and customer_id = ${custId} and deleted_at is null`;
      if (!l) {
        await sql`insert into app.agent_customers (agent_id, customer_id, source) values (${agentId}, ${custId}, 'assigned')`;
        await sql`update app.customers set agent_id = ${agentId} where id = ${custId}`;
      }
    }
  }
  for (const r of ROLES) out.push({ role: r.role, email: logins[r.role].email, password: logins[r.role].password });
  console.log("\nTest accounts (keep private — change or delete before go-live):\n");
  console.table(out);
} catch (e) {
  console.error("Failed:", e.message ?? e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
