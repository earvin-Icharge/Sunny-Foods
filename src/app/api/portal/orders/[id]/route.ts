import type { NextRequest } from "next/server";
import { UserError } from "@/lib/actions";
import { publicUrl } from "@/lib/storage";
import { apiRead, apiWrite } from "../../_lib/server";

// One order of my company: details, items, discount lines, payments (portal-safe view only).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return apiRead(["portal"], async (tx) => {
    const [o] = await tx`select * from app.v_portal_orders where id = ${id}`;
    if (!o) throw new UserError("Order not found.");
    const items = await tx`select id, product_id, product_name, name_zh_hans, name_zh_hant, name_tl, sku, unit, qty, is_free, free_reason,
      regular_price, unit_price, line_total, photo_path from app.v_order_items where order_id = ${id} and deleted_at is null order by sort`;
    const discounts = await tx`select kind, label, code, amount, affects_total from app.order_discounts where order_id = ${id} and deleted_at is null`;
    const payments = await tx`select amount, method, paid_at, reference from app.payments where order_id = ${id} and deleted_at is null order by paid_at`;
    const [s] = await tx`select app.setting_bool('prices_include_vat', true) as incl`;
    return {
      order: o,
      items: items.map((i) => ({ ...i, photo_url: publicUrl(i.photo_path as string | null), photo_path: undefined })),
      discounts, payments, prices_include_vat: s.incl,
    };
  });
}

/** Body: { action: "cancel" | "request_change" | "reorder", reason?, message? } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return apiWrite(["portal", "agent"], async (tx, user) => {
    if (body.action === "cancel") {
      await tx`select app.customer_cancel_order(${id}::uuid, ${String(body.reason ?? "")})`;
      return { done: "cancelled" };
    }
    if (body.action === "request_change") {
      const msg = String(body.message ?? "").trim();
      if (!msg) throw new UserError("Please write what you want to change.");
      await tx`select app.request_order_change(${id}::uuid, ${msg.slice(0, 1000)})`;
      return { done: "requested" };
    }
    if (body.action === "reorder") {
      const [o] = await tx`select customer_id from app.orders where id = ${id}`;
      if (!o) throw new UserError("Order not found.");
      const items = await tx`select i.product_id, sum(i.qty) as qty from app.order_items i
        where i.order_id = ${id} and i.deleted_at is null and not i.is_free group by i.product_id`;
      for (const it of items) {
        const [ex] = await tx`select id from app.cart_items where profile_id = ${user.id} and customer_id = ${o.customer_id as string}
          and product_id = ${it.product_id as string} and deleted_at is null`;
        if (ex) await tx`update app.cart_items set qty = qty + ${Number(it.qty)} where id = ${ex.id as string}`;
        else await tx`insert into app.cart_items (profile_id, customer_id, product_id, qty) values (${user.id}, ${o.customer_id as string}, ${it.product_id as string}, ${Number(it.qty)})`;
      }
      return { done: "reordered", customer_id: o.customer_id, count: items.length };
    }
    throw new UserError("Unknown action.");
  });
}
