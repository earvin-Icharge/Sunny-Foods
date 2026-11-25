import { getLocale, getTranslations } from "next-intl/server";
import type { SessionUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { can } from "@/lib/perms";
import { dateTime } from "@/lib/format";

/** History per record (Spec 8.6): who, when, old value -> new value. Boss/trash viewers only. */
export async function AuditHistory({ user, table, id }: { user: SessionUser; table: string; id: string }) {
  if (!can(user.perms, "trash") && !can(user.perms, "settings", 5)) return null;
  const t = await getTranslations("common");
  const locale = await getLocale();
  const rows = await asUser(user.id, (tx) => tx`
    select a.id, a.at, a.action, a.changed_fields, a.old_data, a.new_data, coalesce(p.full_name, 'System') as who
    from app.audit_log a left join app.profiles p on p.id = a.user_id
    where a.table_name = ${table} and a.record_id = ${id} order by a.at desc limit 50`);
  if (!rows.length) return null;
  const hide = new Set(["updated_at", "created_at", "created_by", "id"]);
  return (
    <details className="card mt-6">
      <summary className="cursor-pointer font-bold">{t("history")} ({rows.length})</summary>
      <ul className="mt-3 grid gap-3 text-sm">
        {rows.map((r) => {
          const fields = ((r.changed_fields as string[] | null) ?? []).filter((f) => !hide.has(f));
          const o = (r.old_data ?? {}) as Record<string, unknown>;
          const n = (r.new_data ?? {}) as Record<string, unknown>;
          return (
            <li key={String(r.id)} className="border-b border-brown/5 pb-2">
              <div><b>{String(r.who)}</b> · {t(`audit.${r.action}`)} · <span className="text-brown/60">{dateTime(r.at as string, locale)}</span></div>
              {fields.length > 0 && (
                <ul className="mt-1 text-brown/70">
                  {fields.map((f) => <li key={f}><code>{f}</code>: {fmt(o[f])} → {fmt(n[f])}</li>)}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  return String(v).slice(0, 80);
}
