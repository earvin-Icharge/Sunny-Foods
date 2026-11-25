import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { dateTime } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { InventoryTabs } from "../InventoryTabs";
import { NewCountButton } from "./NewCountButton";

export const metadata = { title: "Stock counts" };

export default async function CountsPage() {
  const user = await requirePerm("internal", "inventory");
  const t = await getTranslations("inventory");
  const locale = await getLocale();
  const rows = await readAs(user, (tx) => tx`
    select c.id, c.status, c.created_at, c.notes, p.full_name as who,
      (select count(*)::int from app.stock_count_lines l where l.count_id = c.id and l.counted_qty is not null and l.counted_qty <> l.system_qty) as diffs
    from app.stock_counts c left join app.profiles p on p.id = c.counted_by
    where c.deleted_at is null order by c.created_at desc limit 100`);
  return (
    <>
      <PageHeader title={t("tabCounts")} subtitle={t("countHelp")} actions={can(user.perms, "inventory", 2) && <NewCountButton />} />
      <InventoryTabs active="/staff/inventory/counts" />
      {rows.length === 0 ? <Empty>{t("noCounts")}</Empty> : (
        <div className="grid gap-2">
          {rows.map((c) => (
            <Link key={String(c.id)} href={`/staff/inventory/counts/${c.id}`} className="card flex flex-wrap items-center gap-3 hover:ring-sunny/40">
              <span className="flex-1"><b>{dateTime(c.created_at as string, locale)}</b> · {String(c.who ?? "")}{c.notes ? ` · ${c.notes}` : ""}</span>
              <span className="text-sm">{t("differences", { n: Number(c.diffs) })}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${c.status === "approved" ? "bg-st-ok/15 text-st-ok" : c.status === "rejected" ? "bg-st-problem/15 text-st-problem" : c.status === "submitted" ? "bg-st-confirmed/15 text-st-confirmed" : "bg-brown/10"}`}>{t(`count_${c.status}`)}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
