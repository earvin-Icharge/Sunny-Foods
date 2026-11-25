import { NextResponse } from "next/server";
import { asSystem } from "@/lib/db";
import { dispatchPendingPush } from "@/lib/push";
import { cronAllowed } from "../auth";

// Daily jobs (overdue payments, stock/expiry/voucher alerts, agent portal lock).
// Supabase Cron runs the same function; this is the fallback and is safe to run twice.
export async function GET(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  await asSystem((tx) => tx`select app.run_daily_jobs()`);
  const sent = await dispatchPendingPush().catch(() => 0);
  return NextResponse.json({ ok: true, pushed: sent });
}
