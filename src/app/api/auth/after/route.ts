import { NextResponse, type NextRequest } from "next/server";
import { afterLogin } from "@/app/actions/auth";
import { AREAS, type Area } from "@/lib/areas";

// After Google / Facebook login (web and APK): send the person to the right screen.
export async function GET(req: NextRequest) {
  const a = req.nextUrl.searchParams.get("area");
  const area: Area = a === "internal" || a === "agent" ? a : "portal";
  const prefix = AREAS[area].prefix;
  const r = await afterLogin(area);
  const to = r.next ?? (r.ok ? (r.mustChangePassword ? `${prefix}/reset-password?first=1` : prefix) : `${prefix}/login?error=${r.error ?? "wrong_app"}`);
  return NextResponse.redirect(new URL(to, req.nextUrl.origin));
}
