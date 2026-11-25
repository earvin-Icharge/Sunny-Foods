"use server";
import { runAction, UserError } from "@/lib/actions";

/** Approve (creates the payment) or reject an uploaded payment proof. */
export async function reviewProof(proofId: string, approve: boolean, orderId: string | null, note: string | null) {
  return runAction({ area: "internal", module: "payments", level: 3, revalidate: ["/staff/payments"] }, async (tx) => {
    if (!approve && !note?.trim()) throw new UserError("Write a short note so the customer knows why.");
    await tx`select app.review_payment_proof(${proofId}::uuid, ${approve}, ${note ?? null}, ${orderId || null}::uuid)`;
    return null;
  });
}
