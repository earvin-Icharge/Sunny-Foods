import { NextResponse, type NextRequest } from "next/server";

// Ends the owner's "View as…" preview and returns to Master Control.
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/staff/settings/master-control?tab=viewas", req.url));
  res.cookies.delete("sf_view_as");
  return res;
}
