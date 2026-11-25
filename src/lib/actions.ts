import "server-only";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession, type SessionUser } from "./auth";
import { asUser, dbErrorMessage, type Tx } from "./db";
import type { Area } from "./areas";
import { can, type Module } from "./perms";
import { dispatchPendingPush } from "./push";

export type ActionResult<T = unknown> = { ok: true; data: T; auditId?: number | null } | { ok: false; error: string; details?: unknown };

/**
 * Wrapper for every Server Action / API write:
 * - must be logged in to the right area
 * - optional module permission check (the database checks again)
 * - runs as the user (RLS applies), returns a short message on errors
 * - blocked during the owner's read-only "View as" preview
 * - sends pending push notifications afterwards
 */
export async function runAction<T>(
  opts: { area: Area | Area[]; module?: Module; level?: number; revalidate?: string[]; audit?: { table: string; id: (data: T) => string | null | undefined } },
  fn: (tx: Tx, user: SessionUser) => Promise<T>,
): Promise<ActionResult<T>> {
  const user = await getSession();
  if (!user) return { ok: false, error: "Please log in again." };
  const areas = Array.isArray(opts.area) ? opts.area : [opts.area];
  if (!areas.includes(user.area)) return { ok: false, error: "You are not allowed to do this." };
  if (user.viewAs) return { ok: false, error: "Preview mode (View as) is read-only." };
  if (opts.module && !can(user.perms, opts.module, opts.level ?? 1)) return { ok: false, error: "You are not allowed to do this." };
  try {
    let auditId: number | null = null;
    const data = await asUser(user.id, async (tx) => {
      const d = await fn(tx, user);
      const rid = opts.audit?.id(d);
      if (opts.audit && rid) auditId = await lastChangeId(tx, opts.audit.table, rid);
      return d;
    });
    after(() => dispatchPendingPush().catch(() => {}));
    for (const p of opts.revalidate ?? []) revalidatePath(p);
    return { ok: true, data, auditId };
  } catch (e) {
    return { ok: false, error: e instanceof UserError ? e.message : dbErrorMessage(e) };
  }
}

/** Read helper for pages: runs a query as the current user. */
export async function readAs<T>(user: SessionUser, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return asUser(user.id, fn);
}

export class UserError extends Error {}

/** Latest audit-log id the user wrote for a record (for the 10-second Undo). */
export async function lastChangeId(tx: Tx, table: string, id: string): Promise<number | null> {
  const [r] = await tx`select app.my_last_change(${table}, ${id}::uuid) as id`;
  return (r?.id as number) ?? null;
}
