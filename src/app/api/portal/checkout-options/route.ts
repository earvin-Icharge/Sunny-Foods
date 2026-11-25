import type { NextRequest } from "next/server";
import { apiRead, resolveCustomer, PORTAL_AREAS } from "../_lib/server";

// Delivery days, fees, allowed payment methods, addresses, vouchers, employee allowance.
export async function GET(req: NextRequest) {
  return apiRead(PORTAL_AREAS, async (tx, user) => {
    const customer = await resolveCustomer(tx, user, req.nextUrl.searchParams.get("customer_id"));
    const [r] = await tx`select app.checkout_options(${customer}::uuid) as o`;
    return r.o;
  });
}
