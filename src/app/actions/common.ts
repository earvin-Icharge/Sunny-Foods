"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { runAction, type ActionResult } from "@/lib/actions";
import { isLocale } from "@/i18n/config";
import { supabaseServer } from "@/lib/supabase/server";
import { AREAS, type Area } from "@/lib/areas";

/** Language switcher: saves to the cookie and to the user's profile (Spec 3, 4). */
export async function setLanguage(locale: string): Promise<ActionResult<null>> {
  if (!isLocale(locale)) return { ok: false, error: "Unknown language" };
  (await cookies()).set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const s = await getSession();
  if (s && !s.viewAs) {
    await asUser(s.id, (tx) => tx`update app.profiles set language = ${locale} where id = ${s.id}`).catch(() => {});
  }
  return { ok: true, data: null };
}

/** Delete button: moves to Trash, or creates a request for the boss (Spec 8). */
export async function requestDelete(table: string, id: string, reason?: string): Promise<ActionResult<string>> {
  return runAction({ area: "internal", audit: { table, id: () => id } }, async (tx) => {
    const [r] = await tx`select app.request_delete(${table}, ${id}::uuid, ${reason ?? null}) as result`;
    return String(r.result);
  });
}

export async function undoChange(auditId: number): Promise<ActionResult<null>> {
  return runAction({ area: ["internal", "portal", "agent"] }, async (tx) => {
    await tx`select app.undo_change(${auditId})`;
    return null;
  });
}

export async function markNotificationsRead(ids?: string[]): Promise<ActionResult<null>> {
  return runAction({ area: ["internal", "portal", "agent"] }, async (tx, u) => {
    if (ids?.length) await tx`update app.notifications set read_at = now() where user_id = ${u.id} and id = any(${ids}::uuid[]) and read_at is null`;
    else await tx`update app.notifications set read_at = now() where user_id = ${u.id} and read_at is null`;
    return null;
  });
}

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<ActionResult<null>> {
  return runAction({ area: ["internal", "portal", "agent"] }, async (tx, u) => {
    await tx`insert into app.push_subscriptions (user_id, platform, endpoint, p256dh, auth)
             values (${u.id}, 'web', ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
             on conflict (endpoint) where endpoint is not null do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`;
    return null;
  });
}

export async function signOut(area: Area) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  (await cookies()).delete("sf_view_as");
  redirect(`${AREAS[area].prefix}/login`);
}

export async function stopViewAs() {
  (await cookies()).delete("sf_view_as");
  redirect("/staff/settings/master-control");
}
