import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { date, dateTime, localName } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { CountSheet } from "./CountSheet";

export const metadata = { title: "Stock count" };

// Worker counts, app shows the difference, boss approves (Spec 7.3).
export default async function CountPage({ params }: PageProps<"/staff/inventory/counts/[id]">) {
  const { id } = await params;
  const user = await requirePerm("internal", "inventory");
  const t = await getTranslations("inventory");
  const locale = await getLocale();
  const data = await readAs(user, async (tx) => {
    const [c] = await tx`select c.*, p.full_name as who from app.stock_counts c left join app.profiles p on p.id = c.counted_by where c.id = ${id}`;
    if (!c) return null;
    const lines = await tx`select l.id, l.item_type, l.system_qty, l.counted_qty, coalesce(p.name, m.name) as name,
        p.name_zh_hans, p.name_zh_hant, p.name_tl, coalesce(p.unit, m.unit) as unit, b.batch_no, b.location, b.expiry_date
      from app.stock_count_lines l left join app.products p on p.id = l.product_id
      left join app.packaging_materials m on m.id = l.material_id left join app.batches b on b.id = l.batch_id
      where l.count_id = ${id} and l.deleted_at is null order by l.item_type desc, name, b.expiry_date`;
    return { c, lines };
  });
  if (!data) notFound();
  const { c } = data;
  // Blind count: workers without exact-stock permission don't see the system quantity until submitted.
  const showSystem = fieldOn(user.perms, "stock_qty") || c.status !== "draft";
  return (
    <>
      <PageHeader title={`${t("count")} · ${dateTime(c.created_at as string, locale)}`} subtitle={String(c.who ?? "")} back="/staff/inventory/counts"
        actions={<span className={`rounded-full px-3 py-1 text-xs font-bold ${c.status === "approved" ? "bg-st-ok/15 text-st-ok" : c.status === "rejected" ? "bg-st-problem/15 text-st-problem" : c.status === "submitted" ? "bg-st-confirmed/15 text-st-confirmed" : "bg-brown/10"}`}>{t(`count_${c.status}`)}</span>} />
      <CountSheet countId={id} status={String(c.status)} showSystem={showSystem}
        canEdit={can(user.perms, "inventory", 2)} canApprove={can(user.perms, "inventory", 5)}
        lines={data.lines.map((l) => ({
          id: String(l.id), name: l.item_type === "product" ? localName(l, locale) : String(l.name), unit: String(l.unit ?? ""),
          material: l.item_type === "material",
          batch: l.batch_no ? `${l.batch_no} · ${l.location} · ${t("exp")} ${date(l.expiry_date as string, locale)}` : "",
          system: Number(l.system_qty), counted: l.counted_qty === null ? null : Number(l.counted_qty),
        }))} />
    </>
  );
}
