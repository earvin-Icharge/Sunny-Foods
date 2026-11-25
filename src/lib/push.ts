import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { env, serverEnv } from "./env";

let configured = false;
function setup(): boolean {
  if (configured) return true;
  const { vapidPrivateKey, vapidSubject } = serverEnv();
  if (!env.vapidPublicKey || !vapidPrivateKey) return false;
  webpush.setVapidDetails(vapidSubject, env.vapidPublicKey, vapidPrivateKey);
  configured = true;
  return true;
}

/**
 * Sends push messages for new notifications (phone/desktop alerts).
 * Runs after each action and every 5 minutes (Vercel Cron) for scheduled-job alerts.
 * Native store-app tokens are handled in Phase 18 (see mobile/README.md).
 */
export async function dispatchPendingPush(): Promise<number> {
  if (!setup()) return 0;
  const sql = db();
  const rows = await sql`
    update app.notifications n set pushed_at = now()
    where n.id in (select id from app.notifications where pushed_at is null and created_at > now() - interval '30 minutes'
                   order by created_at limit 200 for update skip locked)
    returning n.id, n.user_id, n.title, n.body, n.link, n.kind, n.data`;
  let sent = 0;
  for (const n of rows) {
    const subs = await sql`select id, endpoint, p256dh, auth from app.push_subscriptions
                           where user_id = ${n.user_id as string} and endpoint is not null`;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          JSON.stringify({ title: n.title, body: n.body ?? "", link: n.link ?? "/", kind: n.kind, sound: Boolean((n.data as Record<string, unknown>)?.sound) }),
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sql`update app.push_subscriptions set endpoint = null where id = ${s.id as string}`;
      }
    }
  }
  return sent;
}
