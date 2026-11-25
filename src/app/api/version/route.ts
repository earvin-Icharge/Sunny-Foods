import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

// Used by the OTA update banner (Spec 9): the app compares this with its own build id.
export const dynamic = "force-dynamic";
export async function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
  let critical = false;
  try {
    const log = fs.readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
    const latest = log.split(/\n## /)[1] ?? "";
    critical = /\[critical\]/i.test(latest.split("\n")[0] ?? "");
  } catch {}
  return NextResponse.json({ version, critical }, { headers: { "Cache-Control": "no-store" } });
}
