import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { AREAS, areaFromPath, areaFromSubdomain } from "@/lib/areas";

/**
 * Proxy (Next.js 16 name for middleware) — Spec 1a.
 * - app.sunnyfoods.com.ph   -> /staff/...   (internal app)
 * - order.sunnyfoods.com.ph -> /portal/...  (customer portal)
 * - agent.sunnyfoods.com.ph -> /agent/...   (agent portal)
 * A subdomain can never open another area's pages.
 * Also keeps the Supabase login session fresh.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const url = request.nextUrl.clone();
  const path = url.pathname;
  const hostArea = areaFromSubdomain(host);
  const pathArea = areaFromPath(path);

  let response: NextResponse;

  if (hostArea) {
    const prefix = AREAS[hostArea].prefix;
    // Owner's read-only "View as…" preview (Master Control): on the staff subdomain only,
    // the portal/agent screens may open while the preview cookie is set. The server still
    // checks the owner's permission before showing anything (getSession).
    const viewAsPreview = hostArea === "internal" && Boolean(request.cookies.get("sf_view_as")?.value)
      && (pathArea === "portal" || pathArea === "agent");
    if (pathArea && pathArea !== hostArea && !viewAsPreview) {
      // e.g. order.sunnyfoods.com.ph/staff/... -> blocked
      url.pathname = "/not-found";
      return NextResponse.rewrite(url, { status: 404 });
    }
    if (path === "/manifest.webmanifest") {
      url.pathname = `/api/manifest/${hostArea}`;
      response = NextResponse.rewrite(url);
    } else if (!pathArea && !path.startsWith("/api/")) {
      url.pathname = path === "/" ? prefix : prefix + path;
      response = NextResponse.rewrite(url);
    } else {
      response = NextResponse.next({ request });
    }
  } else {
    response = NextResponse.next({ request });
  }

  // Keep the Supabase session cookie fresh (login stays valid).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl && key) {
    const supabase = createServerClient(supabaseUrl, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getClaims();
  }

  response.headers.set("x-area", hostArea ?? pathArea ?? "");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|icons/|logo|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
