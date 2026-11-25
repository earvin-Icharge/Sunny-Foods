import type { NextRequest } from "next/server";
import { UserError } from "@/lib/actions";
import { uploadFile } from "@/lib/storage";
import { apiWrite } from "../_lib/server";

/** Upload a payment proof (bank / GCash / Maya screenshot or cheque photo) — staff verify it. Multipart form. */
export async function POST(req: NextRequest) {
  const fd = await req.formData();
  return apiWrite(["portal"], async (tx, user) => {
    if (!user.customerId) throw new UserError("Your company account is not set up yet.");
    const file = fd.get("file");
    if (!(file instanceof Blob) || file.size === 0) throw new UserError("Please add a photo of the payment.");
    const amount = Number(fd.get("amount"));
    if (!(amount > 0)) throw new UserError("Enter the amount paid.");
    const method = String(fd.get("method") ?? "");
    if (!["bank_transfer", "gcash", "maya", "cheque"].includes(method)) throw new UserError("Choose how you paid.");
    const orderId = fd.get("order_id") ? String(fd.get("order_id")) : null;
    const path = await uploadFile(file, `proofs/${user.customerId}`);
    const [r] = await tx`select app.submit_payment_proof(${user.customerId}::uuid, ${orderId}::uuid, ${amount}, ${method},
      ${fd.get("reference") ? String(fd.get("reference")) : null}, ${path}) as id`;
    return { id: r.id };
  });
}
