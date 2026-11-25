import type { NextRequest } from "next/server";
import { UserError } from "@/lib/actions";
import { apiRead, apiWrite, resolveCustomer, PORTAL_AREAS } from "../_lib/server";

// My Orders (customer portal). Agents use app.agent_orders on their own screens.
export async function GET() {
  return apiRead(["portal"], async (tx) => {
    const rows = await tx`select id, order_no, status, delivery_date, time_window, delivery_method, payment_status, total, created_at
      from app.v_portal_orders order by created_at desc limit 200`;
    return { items: rows };
  });
}

/** Place the order (portal or agent). Everything is re-calculated and checked in the database. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return apiWrite(PORTAL_AREAS, async (tx, user) => {
    const customer = await resolveCustomer(tx, user, body.customer_id);
    const items = await tx`select product_id, qty from app.cart_items where profile_id = ${user.id} and customer_id = ${customer} and deleted_at is null`;
    if (!items.length) throw new UserError("Your cart is empty.");
    if (user.area === "agent" && body.voucher_code && user.perms.fields.ag_act_voucher !== "on") throw new UserError("Vouchers are not allowed for your account.");
    const p = {
      customer_id: customer,
      items: items.map((i) => ({ product_id: i.product_id, qty: Number(i.qty) })),
      delivery_method: body.delivery_method,
      delivery_date: body.delivery_method === "pickup" ? body.delivery_date || null : body.delivery_date,
      time_window: body.time_window ?? null,
      address_id: body.address_id || null,
      delivery_address: body.delivery_address || null,
      lat: body.lat ?? null, lng: body.lng ?? null,
      payment_method: body.payment_method,
      voucher_code: body.voucher_code || null,
      notes: body.notes ? String(body.notes).slice(0, 1000) : null,
    };
    const [r] = await tx`select app.place_order(${tx.json(p)}) as res`;
    const res = r.res as { ok: boolean; order_id?: string; order_no?: string; errors?: { code: string }[] };
    if (!res.ok) return { ok: false, errors: res.errors ?? [] };
    await tx`update app.cart_items set deleted_at = now() where profile_id = ${user.id} and customer_id = ${customer} and deleted_at is null`;
    return { ok: true, order_id: res.order_id, order_no: res.order_no };
  });
}
