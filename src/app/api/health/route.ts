import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Simple check after deploys: can the server reach the database? (no data returned)
export const dynamic = "force-dynamic";
export async function GET() {
  const checks: Record<string, boolean | string> = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    secretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
    databaseUrl: Boolean(process.env.DATABASE_URL),
  };
  try {
    const [r] = await db()`select count(*)::int as n from app.roles`;
    checks.database = r.n > 0;
  } catch (e) {
    checks.database = false;
    checks.databaseError = String((e as Error).message ?? e).slice(0, 120);
  }
  const ok = Object.entries(checks).every(([k, v]) => k === "databaseError" || v === true);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
