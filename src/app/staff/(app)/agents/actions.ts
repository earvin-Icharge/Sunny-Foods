"use server";
import { randomBytes } from "node:crypto";
import { runAction, UserError } from "@/lib/actions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadFile } from "@/lib/storage";

function str(fd: FormData, k: string) { const v = fd.get(k); return v === null || String(v).trim() === "" ? null : String(v).trim(); }
function num(fd: FormData, k: string) { const v = str(fd, k); return v === null ? null : Number(v); }

async function tempPassword() {
  return "Sf-" + randomBytes(6).toString("base64url");
}

/** Create or edit an agent / broker (Spec 7.13). Optional portal login with a one-time password. */
export async function saveAgent(id: string | null, fd: FormData) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: ["/staff/agents"], audit: { table: "agents", id: (d: { id: string }) => d.id } }, async (tx) => {
    const type = str(fd, "type") === "broker" ? "broker" : "agent";
    const row: Record<string, unknown> = {
      name: str(fd, "name"), type, role_key: str(fd, "role_key") ?? type, phone: str(fd, "phone"), email: str(fd, "email"),
      payout_method: str(fd, "payout_method"), payout_name: str(fd, "payout_name"),
      referral_code: (str(fd, "referral_code") ?? "").toUpperCase(),
      default_rate_kind: str(fd, "default_rate_kind") ?? "percent", default_rate: num(fd, "default_rate") ?? 0,
      team_id: str(fd, "team_id"),
    };
    if (!row.name) throw new UserError("Name is required.");
    if (!row.referral_code) row.referral_code = "AG-" + String(row.name).split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    if (id) {
      if (fd.has("status")) row.status = str(fd, "status");
      if (fd.has("referral_active")) row.referral_active = fd.get("referral_active") === "on";
      await tx`update app.agents set ${tx(row)} where id = ${id}`;
      // keep the login role in step with the agent type
      await tx`update app.profiles set role_key = ${row.role_key as string} where agent_id = ${id} and role_key <> ${row.role_key as string}`;
      return { id, password: null as string | null, email: null as string | null };
    }
    const [a] = await tx`insert into app.agents ${tx(row)} returning id`;
    const agentId = String(a.id);
    let password: string | null = null;
    const email = row.email as string | null;
    if (fd.get("create_login") === "on") {
      if (!email) throw new UserError("An email is needed to create a login.");
      password = await tempPassword();
      const { data, error } = await supabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: row.name } });
      if (error || !data.user) throw new UserError("Could not create login: " + (error?.message ?? "unknown error"));
      const uid = data.user.id;
      try {
        // same transaction as the new agent row (L-010): profile + link in one step
        await tx`select app.create_agent_profile(${uid}::uuid, ${agentId}::uuid)`;
      } catch (e) {
        await supabaseAdmin().auth.admin.deleteUser(uid);
        throw e;
      }
    }
    return { id: agentId, password, email };
  });
}

export async function createAgentLogin(agentId: string) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: [`/staff/agents/${agentId}`] }, async (tx) => {
    const [a] = await tx`select * from app.agents where id = ${agentId}`;
    if (!a) throw new UserError("Agent not found.");
    if (a.profile_id) throw new UserError("This agent already has a login.");
    if (!a.email) throw new UserError("Add an email first.");
    const password = await tempPassword();
    const { data, error } = await supabaseAdmin().auth.admin.createUser({ email: String(a.email), password, email_confirm: true });
    if (error || !data.user) throw new UserError("Could not create login: " + (error?.message ?? "unknown error"));
    const uid = data.user.id;
    try {
      await tx`select app.create_agent_profile(${uid}::uuid, ${agentId}::uuid)`;
    } catch (e) {
      await supabaseAdmin().auth.admin.deleteUser(uid);
      throw e;
    }
    return { password, email: String(a.email) };
  });
}

export async function linkCustomer(agentId: string, customerId: string, startDate: string | null) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: [`/staff/agents/${agentId}`] }, async (tx) => {
    await tx`select app.link_customer_agent(${customerId}::uuid, ${agentId}::uuid, 'assigned', ${startDate}::date)`;
    return null;
  });
}

export async function transferCustomer(fd: FormData) {
  const from = str(fd, "from_agent_id")!;
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: [`/staff/agents/${from}`] }, async (tx) => {
    const customerId = str(fd, "customer_id"); const to = str(fd, "to_agent_id");
    if (!customerId || !to) throw new UserError("Choose the customer and the new agent.");
    if (to === from) throw new UserError("Choose a different agent.");
    const [c] = await tx`select name from app.customers where id = ${customerId}`;
    if (!c || str(fd, "confirm_text") !== String(c.name)) throw new UserError("Type the customer name exactly to confirm.");
    const split = num(fd, "split_from_pct");
    await tx`select app.transfer_customer(${customerId}::uuid, ${from}::uuid, ${to}::uuid, ${str(fd, "scope") ?? "future"},
      ${str(fd, "effective_date") ?? new Date().toISOString().slice(0, 10)}::date, ${str(fd, "reason") ?? ""},
      ${split}::numeric, ${split ? str(fd, "split_until") : null}::date)`;
    return null;
  });
}

export async function cancelCommissions(agentId: string, ids: string[], customerId: string | null, allFuture: boolean, reason: string, confirmText: string) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: [`/staff/agents/${agentId}`] }, async (tx) => {
    const [a] = await tx`select name from app.agents where id = ${agentId}`;
    if (!a || confirmText.trim() !== String(a.name)) throw new UserError("Type the agent name exactly to confirm.");
    if (!ids.length && !(allFuture && customerId)) throw new UserError("Choose commission lines or a customer.");
    await tx`select app.cancel_commissions(${ids}::uuid[], ${customerId}::uuid, ${allFuture}, ${reason})`;
    return null;
  });
}

export async function addAdjustment(agentId: string, amount: number, reason: string) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: [`/staff/agents/${agentId}`] }, async (tx) => {
    if (!amount) throw new UserError("Enter an amount (use minus for a deduction).");
    if (!reason.trim()) throw new UserError("A reason is required.");
    await tx`insert into app.commission_adjustments (agent_id, amount, reason) values (${agentId}, ${amount}, ${reason})`;
    return null;
  });
}

export async function saveTarget(agentId: string, month: string, amount: number) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: [`/staff/agents/${agentId}`] }, async (tx) => {
    const m = month.slice(0, 7) + "-01";
    const [ex] = await tx`select id from app.agent_targets where agent_id = ${agentId} and month = ${m}::date and deleted_at is null`;
    if (ex) await tx`update app.agent_targets set target_amount = ${amount} where id = ${ex.id as string}`;
    else await tx`insert into app.agent_targets (agent_id, month, target_amount) values (${agentId}, ${m}::date, ${amount})`;
    return null;
  });
}

/** Commission rule (agentId null = applies to all agents). */
export async function saveRule(agentId: string | null, fd: FormData) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: ["/staff/agents"] }, async (tx) => {
    const scope = str(fd, "scope");
    const row = {
      agent_id: agentId, scope, product_id: scope === "product" ? str(fd, "product_id") : null,
      category_id: scope === "category" ? str(fd, "category_id") : null, rate_kind: str(fd, "rate_kind") ?? "percent",
      rate: num(fd, "rate"), min_monthly_sales: scope === "monthly_tier" ? num(fd, "min_monthly_sales") ?? 0 : null,
      max_months: num(fd, "max_months"),
    };
    if (!scope || row.rate === null) throw new UserError("Choose the rule type and rate.");
    if (scope === "product" && !row.product_id) throw new UserError("Choose a product.");
    if (scope === "category" && !row.category_id) throw new UserError("Choose a category.");
    await tx`insert into app.commission_rules ${tx(row)}`;
    return null;
  });
}

export async function toggleRule(ruleId: string, active: boolean) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: ["/staff/agents"] }, async (tx) => {
    await tx`update app.commission_rules set active = ${active} where id = ${ruleId}`;
    return null;
  });
}

export async function deleteRule(ruleId: string) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: ["/staff/agents"] }, async (tx) => {
    await tx`update app.commission_rules set deleted_at = now() where id = ${ruleId}`;
    return null;
  });
}

// ---------------- Resignation & settlement ----------------
export async function resignAgent(agentId: string, lastDay: string, confirmText: string) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: [`/staff/agents/${agentId}`] }, async (tx) => {
    const [a] = await tx`select name from app.agents where id = ${agentId}`;
    if (!a || confirmText.trim() !== String(a.name)) throw new UserError("Type the agent name exactly to confirm.");
    const [r] = await tx`select app.resign_agent(${agentId}::uuid, ${lastDay}::date) as id`;
    return String(r.id);
  });
}

export async function saveSettlement(sid: string, fd: FormData) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: ["/staff/agents"] }, async (tx) => {
    const [s] = await tx`select * from app.agent_settlements where id = ${sid}`;
    if (!s) throw new UserError("Settlement not found.");
    if (s.status === "done") throw new UserError("This settlement is already done.");
    const decisions = (JSON.parse(String(fd.get("decisions") ?? "[]")) as Record<string, unknown>[]).map((d) => ({
      customer_id: d.customer_id, action: d.action, to_agent_id: d.action === "transfer" ? d.to_agent_id || null : null,
      until: d.action === "keep" ? d.until || null : null,
    }));
    const decision = str(fd, "commission_decision") ?? "full";
    const amount = num(fd, "settlement_amount");
    if (decision === "partial" && !(amount && amount > 0)) throw new UserError("Enter the settlement amount.");
    const signed = fd.get("signed") as File | null;
    const signedPath = signed && signed.size > 0 ? await uploadFile(signed, `settlements/${s.agent_id}`) : undefined;
    const row: Record<string, unknown> = {
      customer_decisions: tx.json(decisions as never), commission_decision: decision,
      settlement_amount: decision === "partial" ? amount : null, notes: str(fd, "notes"),
    };
    if (signedPath) row.signed_path = signedPath;
    const status = str(fd, "status");
    if (status === "agreed" || status === "draft") row.status = status;
    await tx`update app.agent_settlements set ${tx(row)} where id = ${sid}`;
    return sid;
  });
}

export async function applySettlement(sid: string, confirmText: string) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: ["/staff/agents"] }, async (tx) => {
    if (confirmText.trim().toUpperCase() !== "APPLY") throw new UserError("Type APPLY to confirm.");
    await tx`select app.apply_settlement(${sid}::uuid)`;
    return null;
  });
}

// ---------------- Payouts ----------------
export async function runPayouts(from: string, to: string) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: ["/staff/agents/payouts"] }, async (tx) => {
    if (!from || !to || from > to) throw new UserError("Choose a valid period.");
    const [r] = await tx`select app.create_payout_run(${from}::date, ${to}::date) as n`;
    return Number(r.n);
  });
}

export async function approvePayout(id: string) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: ["/staff/agents/payouts"] }, async (tx) => {
    await tx`select app.approve_payout(${id}::uuid)`;
    return null;
  });
}

export async function approveAllPayouts(ids: string[]) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: ["/staff/agents/payouts"] }, async (tx) => {
    for (const id of ids) await tx`select app.approve_payout(${id}::uuid)`;
    return ids.length;
  });
}

export async function payPayout(id: string, fd: FormData) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: ["/staff/agents/payouts"] }, async (tx) => {
    const proof = fd.get("proof") as File | null;
    const path = proof && proof.size > 0 ? await uploadFile(proof, "payouts") : null;
    await tx`select app.mark_payout_paid(${id}::uuid, ${str(fd, "paid_at")}::date, ${str(fd, "method")}, ${str(fd, "reference")}, ${path})`;
    return null;
  });
}

export async function cancelPayout(id: string) {
  return runAction({ area: "internal", module: "agents", level: 5, revalidate: ["/staff/agents/payouts"] }, async (tx) => {
    await tx`select app.cancel_payout(${id}::uuid)`;
    return null;
  });
}
