// Central place for environment settings (read once).
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "sunnyfoods.com.ph",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
};

export function serverEnv() {
  return {
    secretKey: process.env.SUPABASE_SECRET_KEY ?? "",
    databaseUrl: process.env.DATABASE_URL ?? "",
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:no-reply@sunnyfoods.com.ph",
    cronSecret: process.env.CRON_SECRET ?? "",
  };
}
