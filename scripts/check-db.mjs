// Runs before each Vercel build: prints whether the server can reach the database.
// Never prints the connection address or password. Never stops the build.
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DB check: DATABASE_URL not set (skipped)");
  process.exit(0);
}
async function tryUrl(label, u) {
  const sql = postgres(u, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    const [r] = await sql`select count(*)::int as roles, current_user as who from app.roles`;
    console.log(`DB check ${label}: OK (user ${r.who}, ${r.roles} roles)`);
  } catch (e) {
    console.log(`DB check ${label}: FAILED — ${String(e?.message ?? e).slice(0, 160)}`);
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}
const host = new URL(url).hostname;
await tryUrl(`[${host}]`, url);
// Also try the other Supabase pooler clusters / session mode, to show which address works.
for (const h of ["aws-0-ap-southeast-1.pooler.supabase.com", "aws-1-ap-southeast-1.pooler.supabase.com"]) {
  if (h === host) continue;
  const u = new URL(url); u.hostname = h;
  await tryUrl(`[${h}]`, u.toString());
}
{ const u = new URL(url); u.port = "5432"; await tryUrl(`[${host}:5432 session]`, u.toString()); }
console.log(`Secret key set: ${Boolean(process.env.SUPABASE_SECRET_KEY)}`);
