import { NextResponse } from "next/server";
import { dispatchPendingPush } from "@/lib/push";
import { cronAllowed } from "../auth";

// Every 5 minutes: send phone/desktop alerts for notifications made by scheduled jobs.
export async function GET(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const sent = await dispatchPendingPush();
  return NextResponse.json({ ok: true, sent });
}
