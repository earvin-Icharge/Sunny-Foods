// The three access areas (Spec 1a). One codebase, one database.
export type Area = "internal" | "portal" | "agent";

export const AREAS: Record<Area, { prefix: string; subdomain: string; appName: string; shortName: string }> = {
  internal: { prefix: "/staff", subdomain: "app", appName: "Sunny Foods Staff", shortName: "SF Staff" },
  portal: { prefix: "/portal", subdomain: "order", appName: "Sunny Foods Order", shortName: "SF Order" },
  agent: { prefix: "/agent", subdomain: "agent", appName: "Sunny Foods Agent", shortName: "SF Agent" },
};

export function areaFromSubdomain(host: string): Area | null {
  const sub = host.split(":")[0].split(".")[0];
  if (sub === "app") return "internal";
  if (sub === "order") return "portal";
  if (sub === "agent") return "agent";
  return null;
}

export function areaFromPath(pathname: string): Area | null {
  if (pathname === "/staff" || pathname.startsWith("/staff/")) return "internal";
  if (pathname === "/portal" || pathname.startsWith("/portal/")) return "portal";
  if (pathname === "/agent" || pathname.startsWith("/agent/")) return "agent";
  return null;
}
