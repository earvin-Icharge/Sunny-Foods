import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { asUser } from "@/lib/db";

// Latest notifications for the bell (own rows only — RLS).
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ items: [], unread: 0 }, { status: 401 });
  const data = await asUser(s.id, async (tx) => {
    const items = await tx`select id, kind, title, body, link, data, read_at, created_at from app.notifications
                           where user_id = ${s.id} order by created_at desc limit 30`;
    const [c] = await tx`select count(*)::int as n from app.notifications where user_id = ${s.id} and read_at is null`;
    return { items, unread: c.n };
  });
  return NextResponse.json(data);
}
