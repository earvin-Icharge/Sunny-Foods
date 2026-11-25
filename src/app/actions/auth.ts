"use server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import type { Area } from "@/lib/areas";

/** After password login: make sure this account belongs to this app, and apply its language. */
export async function afterLogin(area: Area): Promise<{ ok: boolean; error?: string; mustChangePassword?: boolean }> {
  const s = await getSession();
  if (!s) {
    return { ok: false, error: "account_not_ready" };
  }
  if (s.area !== area) {
    const sb = await supabaseServer();
    await sb.auth.signOut();
    return { ok: false, error: "wrong_app" };
  }
  (await cookies()).set("NEXT_LOCALE", s.language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return { ok: true, mustChangePassword: s.mustChangePassword };
}
