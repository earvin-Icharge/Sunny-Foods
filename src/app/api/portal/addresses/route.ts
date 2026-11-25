import type { NextRequest } from "next/server";
import { UserError } from "@/lib/actions";
import { apiWrite } from "../_lib/server";

/** Add / edit / remove a delivery address. Body: { id?, label, address, lat?, lng?, is_default?, remove? } */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  return apiWrite(["portal"], async (tx, user) => {
    if (!user.customerId) throw new UserError("Your company account is not set up yet.");
    const cid = user.customerId;
    if (b.remove && b.id) {
      await tx`update app.customer_addresses set deleted_at = now() where id = ${b.id} and customer_id = ${cid}`;
      return null;
    }
    const label = String(b.label ?? "").trim() || "Main";
    const address = String(b.address ?? "").trim();
    if (!address) throw new UserError("Address is required.");
    const lat = b.lat === "" || b.lat == null ? null : Number(b.lat);
    const lng = b.lng === "" || b.lng == null ? null : Number(b.lng);
    if (b.is_default) await tx`update app.customer_addresses set is_default = false where customer_id = ${cid} and deleted_at is null`;
    if (b.id) {
      await tx`update app.customer_addresses set label = ${label}, address = ${address}, lat = ${lat}, lng = ${lng}, is_default = ${Boolean(b.is_default)}
        where id = ${b.id} and customer_id = ${cid}`;
      return { id: b.id };
    }
    const [r] = await tx`insert into app.customer_addresses (customer_id, label, address, lat, lng, is_default)
      values (${cid}, ${label}, ${address}, ${lat}, ${lng}, ${Boolean(b.is_default)}) returning id`;
    return { id: r.id };
  });
}
