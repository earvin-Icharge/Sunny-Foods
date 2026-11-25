import "server-only";
import type { Tx } from "@/lib/db";

/** Options for the voucher builder. */
export async function voucherOptions(tx: Tx) {
  const products = await tx`select id, name, sku from app.products where deleted_at is null and archived_at is null order by name`;
  const categories = await tx`select id, name from app.categories where deleted_at is null order by sort, name`;
  const tiers = await tx`select id, name from app.price_tiers where deleted_at is null and active order by name`;
  const customers = await tx`select id, name from app.customers where deleted_at is null and status = 'approved' order by name`;
  const o = (rows: Record<string, unknown>[], label?: (r: Record<string, unknown>) => string) =>
    rows.map((r) => ({ id: String(r.id), name: label ? label(r) : String(r.name) }));
  return {
    products: o(products, (r) => `${r.name} (${r.sku})`), categories: o(categories), tiers: o(tiers), customers: o(customers),
  };
}
