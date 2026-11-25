import "server-only";
import { serverEnv } from "@/lib/env";

/** Scheduled-job URLs only run with the secret (Vercel Cron sends "Authorization: Bearer CRON_SECRET"). */
export function cronAllowed(req: Request): boolean {
  const secret = serverEnv().cronSecret;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}
