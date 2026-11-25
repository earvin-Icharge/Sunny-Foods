"use server";
import { runAction, UserError } from "@/lib/actions";
import { uploadFile } from "@/lib/storage";

export async function startPacking(orderId: string) {
  return runAction({ area: "internal", revalidate: ["/staff/packing", `/staff/packing/${orderId}`] }, async (tx) => {
    await tx`select app.set_order_status(${orderId}::uuid, 'packing', null)`;
    return null;
  });
}

export async function toggleCheck(checkId: string, checked: boolean) {
  return runAction({ area: "internal", module: "packing", level: 3 }, async (tx) => {
    await tx`select app.toggle_packing_check(${checkId}::uuid, ${checked})`;
    return null;
  });
}

/** Mark Packed: all boxes ticked (checked again in the database), optional photo, packed quantities. */
export async function markPacked(orderId: string, fd: FormData) {
  return runAction({ area: "internal", module: "packing", level: 3, revalidate: ["/staff/packing", `/staff/orders/${orderId}`] }, async (tx) => {
    const photo = fd.get("photo") as File | null;
    const photoPath = photo && photo.size > 0 ? await uploadFile(photo, `packing/${orderId}`) : null;
    let packed: Record<string, number> = {};
    try { packed = JSON.parse(String(fd.get("packed") || "{}")); } catch { throw new UserError("Invalid quantities."); }
    const confirm = fd.get("confirm_qty_change") === "1";
    await tx`select app.mark_packed(${orderId}::uuid, ${photoPath}, ${JSON.stringify(packed)}::jsonb, ${confirm})`;
    return null;
  });
}
