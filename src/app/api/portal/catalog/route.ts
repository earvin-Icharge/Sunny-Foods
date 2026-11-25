import type { NextRequest } from "next/server";
import { publicUrl } from "@/lib/storage";
import { apiRead, resolveCustomer, PORTAL_AREAS } from "../_lib/server";

// Catalog with the customer's own price + stock badge only (Spec 7.10).
export async function GET(req: NextRequest) {
  return apiRead(PORTAL_AREAS, async (tx, user) => {
    const asked = req.nextUrl.searchParams.get("customer_id");
    const customer = user.area === "agent" && !asked ? null : await resolveCustomer(tx, user, asked);
    const [r] = await tx`select app.portal_catalog(${customer}::uuid) as items`;
    const [c] = customer ? await tx`select app.customer_status_for(${customer}::uuid) as status` : [];
    const items = (r.items as Record<string, unknown>[]).map((p) => ({ ...p, photo_url: publicUrl(p.photo_path as string | null), photo_path: undefined }));
    return { items, customer_status: (c?.status as string) ?? (user.area === "agent" ? "approved" : null) };
  });
}
