import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, serverEnv } from "../env";

// Uses the SECRET key: server only. Creates accounts, uploads files, signs file links.
export function supabaseAdmin() {
  return createClient(env.supabaseUrl, serverEnv().secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
