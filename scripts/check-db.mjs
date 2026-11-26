// Runs before each Vercel build: prints whether the server can reach the database.
// Never prints the connection address or password. Never stops the build.
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DB check: DATABASE_URL not set (skipped)");
  process.exit(0);
}
const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
try {
  const [r] = await sql`select count(*)::int as roles, current_user as who from app.roles`;
  console.log(`DB check: OK (user ${r.who}, ${r.roles} roles)`);
} catch (e) {
  console.log(`DB check: FAILED — ${String(e?.message ?? e).slice(0, 160)}`);
} finally {
  await sql.end({ timeout: 2 }).catch(() => {});
  console.log(`Secret key set: ${Boolean(process.env.SUPABASE_SECRET_KEY)}`);
}
