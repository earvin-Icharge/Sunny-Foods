import type { NextRequest } from "next/server";
import { UserError } from "@/lib/actions";
import { apiRead, apiWrite, resolveCustomer, PORTAL_AREAS } from "../_lib/server";

// Cart lines belong to the logged-in person (+ the customer they order for).
export async function GET(req: NextRequest) {
  return apiRead(PORTAL_AREAS, async (tx, user) => {
    const customer = await resolveCustomer(tx, user, req.nextUrl.searchParams.get("customer_id"));
    const rows = await tx`select product_id, qty from app.cart_items
      where profile_id = ${user.id} and customer_id = ${customer} and deleted_at is null order by created_at`;
    return { customer_id: customer, items: rows.map((r) => ({ product_id: r.product_id, qty: Number(r.qty) })) };
  });
}

/** Body: { customer_id?, product_id, qty, mode: "set" | "add" } — qty 0 removes the line. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return apiWrite(PORTAL_AREAS, async (tx, user) => {
    const customer = await resolveCustomer(tx, user, body.customer_id);
    const productId = String(body.product_id ?? "");
    let qty = Number(body.qty ?? 0);
    if (!productId || !Number.isFinite(qty) || qty < 0 || qty > 100000) throw new UserError("Invalid quantity.");
    const [ex] = await tx`select id, qty from app.cart_items where profile_id = ${user.id} and customer_id = ${customer}
      and product_id = ${productId} and deleted_at is null`;
    if (body.mode === "add" && ex) qty = Number(ex.qty) + qty;
    if (qty <= 0) {
      if (ex) await tx`update app.cart_items set deleted_at = now() where id = ${ex.id as string}`;
    } else if (ex) {
      await tx`update app.cart_items set qty = ${qty} where id = ${ex.id as string}`;
    } else {
      await tx`insert into app.cart_items (profile_id, customer_id, product_id, qty) values (${user.id}, ${customer}, ${productId}, ${qty})`;
    }
    return { qty };
  });
}

export async function DELETE(req: NextRequest) {
  const asked = req.nextUrl.searchParams.get("customer_id");
  return apiWrite(PORTAL_AREAS, async (tx, user) => {
    const customer = await resolveCustomer(tx, user, asked);
    await tx`update app.cart_items set deleted_at = now() where profile_id = ${user.id} and customer_id = ${customer} and deleted_at is null`;
    return null;
  });
}
