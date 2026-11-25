import type { NextRequest } from "next/server";
import { UserError } from "@/lib/actions";
import { apiWrite } from "../_lib/server";

/** Data Privacy Act requests (Spec 7.10, 8.13): a copy of my data, or deletion ("Delete my account"). */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  return apiWrite(["portal", "agent"], async (tx) => {
    const kind = b.kind === "deletion" ? "deletion" : b.kind === "copy" ? "copy" : null;
    if (!kind) throw new UserError("Unknown request.");
    if (kind === "deletion" && String(b.confirm ?? "").trim().toUpperCase() !== "DELETE") throw new UserError("Type DELETE to confirm.");
    const [r] = await tx`select app.request_my_data(${kind}, ${b.notes ? String(b.notes).slice(0, 500) : null}) as id`;
    return { id: r.id };
  });
}
