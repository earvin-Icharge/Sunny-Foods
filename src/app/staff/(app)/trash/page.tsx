import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { dateTime } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { TrashRowActions } from "./TrashRowActions";

export const metadata = { title: "Trash" };

/** Trash (Spec 8.5): everything deleted can be restored; only the Owner can empty one item. */
export default async function TrashPage({ searchParams }: PageProps<"/staff/trash">) {
  const user = await requirePerm("internal", "trash");
  const t = await getTranslations("trash");
  const locale = await getLocale();
  const sp = await searchParams;
  const filter = typeof sp.table === "string" ? sp.table : "";
  const d = await readAs(user, async (tx) => ({
    rows: await tx`select * from app.trash_list() where (${filter} = '' or table_name = ${filter}) order by deleted_at desc limit 500`,
    pending: await tx`select count(*)::int as n from app.delete_requests where status = 'pending' and deleted_at is null`,
  }));
  const tables = [...new Set(d.rows.map((r) => String(r.table_name)))];
  const pending = Number(d.pending[0]?.n ?? 0);
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={
        <Link className="btn-secondary" href="/staff/delete-requests">{t("deleteRequests")}{pending > 0 && <span className="rounded-full bg-sunny px-2 text-xs text-white">{pending}</span>}</Link>
      } />
      {(tables.length > 1 || filter) && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href="?" className={`rounded-full px-4 py-2 text-sm font-semibold ${!filter ? "bg-sunny text-white" : "bg-white"}`}>{t("all")}</Link>
          {(filter ? [filter] : tables).map((x) => <Link key={x} href={`?table=${x}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === x ? "bg-sunny text-white" : "bg-white"}`}>{t(`table_${x}`)}</Link>)}
        </div>
      )}
      {d.rows.length === 0 ? <Empty>{t("empty")}</Empty> : (
        <div className="grid gap-2">
          {d.rows.map((r) => (
            <div key={`${r.table_name}:${r.id}`} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-48 flex-1">
                <div className="font-bold">{String(r.label)}</div>
                <div className="text-sm text-brown/60">{t(`table_${r.table_name}`)} · {t("deletedBy", { name: String(r.deleted_by_name ?? "—"), when: dateTime(r.deleted_at as string, locale) })}</div>
              </div>
              {can(user.perms, "trash", 5) && <TrashRowActions table={String(r.table_name)} id={String(r.id)} label={String(r.label)} isOwner={user.roleKey === "owner"} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
