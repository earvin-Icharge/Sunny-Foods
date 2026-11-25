import { NextResponse } from "next/server";
import { AREAS, type Area } from "@/lib/areas";

// Each area installs as its own app with its own name (Spec 1a).
export async function GET(_req: Request, ctx: RouteContext<"/api/manifest/[area]">) {
  const { area } = await ctx.params;
  const a = AREAS[(area as Area)] ?? AREAS.portal;
  return NextResponse.json({
    name: a.appName,
    short_name: a.shortName,
    start_url: a.prefix,
    scope: "/",
    display: "standalone",
    background_color: "#FAF6F1",
    theme_color: "#B81C21",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json" } });
}
