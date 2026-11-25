import type { NextRequest } from "next/server";
import { UserError } from "@/lib/actions";
import { apiRead, apiWrite } from "../_lib/server";

// My Account: company, addresses, users, balance, payments, proofs, vouchers (Spec 7.10).
export async function GET() {
  return apiRead(["portal"], async (tx, user) => {
    if (!user.customerId) throw new UserError("Your company account is not set up yet.");
    const [r] = await tx`select app.portal_account(${user.customerId}::uuid) as a`;
    const requests = await tx`select kind, status, created_at from app.data_requests where profile_id = ${user.id} order by created_at desc limit 10`;
    return { ...(r.a as Record<string, unknown>), me: { id: user.id, name: user.fullName, email: user.email }, data_requests: requests };
  });
}

/** Update company contact details (name and terms are set by Sunny Foods). */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return apiWrite(["portal"], async (tx, user) => {
    if (!user.customerId) throw new UserError("Your company account is not set up yet.");
    const p = {
      contact_person: body.contact_person ?? null, phone: body.phone ?? null, email: body.email ?? null,
      address: body.address ?? null, lat: body.lat ?? null, lng: body.lng ?? null,
    };
    await tx`select app.portal_update_company(${user.customerId}::uuid, ${tx.json(p)})`;
    return null;
  });
}
