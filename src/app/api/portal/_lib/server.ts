import "server-only";
import { NextResponse } from "next/server";
import { getSession, type SessionUser } from "@/lib/auth";
import { asUser, dbErrorMessage, type Tx } from "@/lib/db";
import { runAction, UserError } from "@/lib/actions";
import type { Area } from "@/lib/areas";

// Shared helpers for the portal JSON API (used by the web portal, the agent portal
// in "agent mode", and later the bundled store app with a Bearer token — Spec 9a).

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Read as the logged-in portal (or agent) user. */
export async function apiRead(areas: Area[], fn: (tx: Tx, user: SessionUser) => Promise<unknown>) {
  const user = await getSession();
  if (!user) return json({ error: "Please log in again." }, 401);
  if (!areas.includes(user.area)) return json({ error: "You are not allowed to do this." }, 403);
  try {
    return json(await asUser(user.id, (tx) => fn(tx, user)));
  } catch (e) {
    return json({ error: e instanceof UserError ? e.message : dbErrorMessage(e) }, 400);
  }
}

/** Write as the logged-in user (same checks as Server Actions). */
export async function apiWrite<T>(areas: Area[], fn: (tx: Tx, user: SessionUser) => Promise<T>) {
  const r = await runAction({ area: areas }, fn);
  return r.ok ? json({ ok: true, data: r.data }) : json({ ok: false, error: r.error }, 400);
}

/**
 * Which customer is this request for?
 * - portal user: always their own company (ignores what the phone sends)
 * - agent: the customer id sent, checked by the database (must be linked to the agent)
 */
export async function resolveCustomer(tx: Tx, user: SessionUser, requested: string | null | undefined): Promise<string> {
  if (user.area === "portal") {
    if (!user.customerId) throw new UserError("Your company account is not set up yet.");
    return user.customerId;
  }
  if (!requested) throw new UserError("Choose a customer first.");
  const [r] = await tx`select app.can_view_customer_checkout(${requested}::uuid) as ok`;
  if (!r?.ok) throw new UserError("This customer is not linked to you.");
  return requested;
}

export const PORTAL_AREAS: Area[] = ["portal", "agent"];
