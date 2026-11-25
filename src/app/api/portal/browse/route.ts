import { db } from "@/lib/db";
import { publicUrl } from "@/lib/storage";
import { json } from "../_lib/server";

// Public browse without login: products, photos and stock badges — no prices (Spec 13).
export async function GET() {
  try {
    const [r] = await db()`select app.public_catalog() as items`;
    const items = (r.items as Record<string, unknown>[]).map((p) => ({ ...p, price: null, regular_price: null, stock_qty: null,
      photo_url: publicUrl(p.photo_path as string | null), photo_path: undefined }));
    return json({ items, customer_status: null });
  } catch {
    return json({ items: [], customer_status: null });
  }
}
