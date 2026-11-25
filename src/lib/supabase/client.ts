"use client";
import { createBrowserClient } from "@supabase/ssr";
import { env } from "../env";

// Browser client: login/logout and live notifications only (publishable key).
let client: ReturnType<typeof createBrowserClient> | null = null;
export function supabaseBrowser() {
  if (!client) client = createBrowserClient(env.supabaseUrl, env.publishableKey);
  return client;
}
