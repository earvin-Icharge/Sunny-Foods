import "server-only";
import type { SessionUser } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { fieldOn } from "@/lib/perms";
import { localName } from "@/lib/format";
import { publicUrl } from "@/lib/storage";
import type { ProductOption } from "./OrderForm";

/** Products + settings for the staff order form (price only when the user may see it). */
export async function orderFormData(user: SessionUser, locale: string) {
  const showPrice = fieldOn(user.perms, "price");
  return readAs(user, async (tx) => {
    const prows = await tx`select * from app.v_products where deleted_at is null and active and archived_at is null order by category_name nulls last, name`;
    const crows = await tx`select id, name, status from app.v_customers where deleted_at is null and status in ('approved','pending') order by name`;
    const [s] = await tx`select app.setting('time_windows') as tw`;
    const products: ProductOption[] = prows.map((p) => ({
      id: String(p.id), name: localName(p, locale), sku: String(p.sku), unit: String(p.unit), category: localName(p, locale, "category_name"),
      photo: publicUrl(p.photo_path as string | null), price: showPrice && p.default_price !== null ? Number(p.default_price) : null,
      stock: p.stock_qty === null || p.stock_qty === undefined ? null : Number(p.stock_qty), badge: String(p.stock_badge),
    }));
    return {
      products,
      customers: crows.map((c) => ({ id: String(c.id), name: String(c.name), status: String(c.status) })),
      timeWindows: (s.tw as string[]) ?? [],
      showPrice,
    };
  });
}
