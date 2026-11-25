import type { NextRequest } from "next/server";
import { apiWrite, resolveCustomer, PORTAL_AREAS } from "../_lib/server";
import { UserError } from "@/lib/actions";

// Live price breakdown — calculated in the database, never trusted from the phone (Spec 7.12, 8.11).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return apiWrite(PORTAL_AREAS, async (tx, user) => {
    const customer = await resolveCustomer(tx, user, body.customer_id);
    if (user.area === "agent" && body.voucher_code && user.perms.fields.ag_act_voucher !== "on") throw new UserError("Vouchers are not allowed for your account.");
    const p = {
      customer_id: customer,
      items: Array.isArray(body.items) ? body.items.map((i: { product_id: string; qty: number }) => ({ product_id: i.product_id, qty: Number(i.qty) })) : [],
      delivery_method: body.delivery_method ?? "own_truck",
      voucher_code: body.voucher_code || null,
      record_attempt: Boolean(body.voucher_code) && Boolean(body.record_attempt),
    };
    const [r] = await tx`select app.quote_order(${tx.json(p)}) as q`;
    const q = r.q as Record<string, unknown>;
    // drop internal fields the phone does not need
    delete q.commission_base;
    q.lines = ((q.lines as Record<string, unknown>[]) ?? []).map((l) => ({ ...l, stock_free: undefined }));
    q.warnings = [];
    return q;
  });
}
