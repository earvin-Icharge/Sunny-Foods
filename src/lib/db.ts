import "server-only";
import postgres from "postgres";
import { serverEnv } from "./env";

// One shared connection pool to Supabase Postgres (transaction pooler).
// Business tables live in the private schema "app" (not exposed by the REST API).
type Sql = postgres.Sql<Record<string, unknown>>;

const globalForDb = globalThis as unknown as { __sfSql?: Sql };

export function db(): Sql {
  if (!globalForDb.__sfSql) {
    const url = serverEnv().databaseUrl;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__sfSql = postgres(url, {
      prepare: false, // required for the Supabase transaction pooler
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: { undefined: null },
      types: {
        // return numeric as JS number (money is rounded to 2 decimals in the database)
        numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
      },
    }) as unknown as Sql;
  }
  return globalForDb.__sfSql;
}

export type Tx = postgres.TransactionSql<Record<string, unknown>>;

/**
 * Run queries AS the logged-in user: role "authenticated" + their user id,
 * so Row Level Security and the permission functions (app.can, app.field)
 * apply exactly as in the database rules.
 */
export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return (await db().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('request.jwt.claim.sub', ${userId}, true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx);
  })) as T;
}

/** System access (bypasses RLS). Only for sign-up, account creation and scheduled jobs. */
export async function asSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin(async (tx) => fn(tx))) as T;
}

/** Turn a database error into a short message for the screen. */
export function dbErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === "P0001" || err?.code === "P0002") return err.message ?? "Not allowed.";
  if (err?.code === "42501") return "You are not allowed to do this.";
  if (err?.code === "23505") return "This already exists.";
  if (err?.code === "23503") return "This item is linked to other records.";
  console.error(e);
  return "Something went wrong. Please try again.";
}
