"use server";
import { runAction } from "@/lib/actions";

export async function restoreItem(table: string, id: string) {
  return runAction({ area: "internal", module: "trash", level: 5, revalidate: ["/staff/trash"] }, async (tx) => {
    await tx`select app.restore_item(${table}, ${id}::uuid)`;
    return null;
  });
}

/** Empty ONE item from Trash for good (Owner only, type the name — second confirmation). */
export async function purgeItem(table: string, id: string, confirmText: string) {
  return runAction({ area: "internal", module: "trash", level: 5, revalidate: ["/staff/trash"] }, async (tx) => {
    await tx`select app.purge_item(${table}, ${id}::uuid, ${confirmText})`;
    return null;
  });
}

export async function decideDeleteRequest(id: string, approve: boolean) {
  return runAction({ area: "internal", module: "trash", level: 1, revalidate: ["/staff/delete-requests", "/staff/trash"] }, async (tx) => {
    await tx`select app.decide_delete_request(${id}::uuid, ${approve})`;
    return null;
  });
}
