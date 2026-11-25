"use server";
import { runAction, UserError } from "@/lib/actions";
import { uploadFile } from "@/lib/storage";

/** Mark Delivered: proof photo required (not for pickup) + cash/COD collected (Spec 7.7). */
export async function markDelivered(orderId: string, isPickup: boolean, fd: FormData) {
  return runAction({ area: "internal", module: "deliveries", level: 3, revalidate: ["/staff/deliveries", `/staff/orders/${orderId}`] }, async (tx) => {
    const photo = fd.get("proof") as File | null;
    if (!isPickup && (!photo || photo.size === 0)) throw new UserError("A proof photo is required.");
    const proofPath = photo && photo.size > 0 ? await uploadFile(photo, `deliveries/${orderId}`) : null;
    const cod = Number(fd.get("collected") || 0);
    if (cod < 0) throw new UserError("Amount cannot be negative.");
    await tx`select app.mark_delivered(${orderId}::uuid, ${proofPath}, ${cod}, ${(fd.get("notes") as string) || null})`;
    return null;
  });
}

export async function dispatchOrder(orderId: string) {
  return runAction({ area: "internal", module: "deliveries", level: 3, revalidate: ["/staff/deliveries", `/staff/orders/${orderId}`] }, async (tx) => {
    await tx`select app.set_order_status(${orderId}::uuid, 'out_for_delivery', null)`;
    return null;
  });
}
