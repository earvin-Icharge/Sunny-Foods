import type { NextRequest } from "next/server";
import { UserError } from "@/lib/actions";
import { apiWrite } from "../_lib/server";

/** Store app (Capacitor): save the phone's push token so order-status alerts reach it (Spec 9a). */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  return apiWrite(["portal"], async (tx, user) => {
    const token = String(b.token ?? "");
    const platform = b.platform === "ios" ? "ios" : b.platform === "android" ? "android" : null;
    if (!token || !platform) throw new UserError("Invalid token.");
    await tx`insert into app.push_subscriptions (user_id, platform, device_token) values (${user.id}, ${platform}, ${token})
      on conflict (device_token) where device_token is not null do update set user_id = excluded.user_id, platform = excluded.platform`;
    return null;
  });
}
