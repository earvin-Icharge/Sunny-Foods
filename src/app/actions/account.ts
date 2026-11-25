"use server";
import { getSession } from "@/lib/auth";
import { asUser } from "@/lib/db";

export async function clearMustChangePassword() {
  const s = await getSession();
  if (!s || s.viewAs) return;
  await asUser(s.id, (tx) => tx`update app.profiles set must_change_password = false where id = ${s.id}`);
}
