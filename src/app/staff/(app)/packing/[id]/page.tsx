import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { date, localName } from "@/lib/format";
import { publicUrl } from "@/lib/storage";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PackingScreen, type PackItem } from "./PackingScreen";

export const metadata = { title: "Packing" };

/** One order at a time, big photos, batch to take, checklist lock (Spec 7.6). Never shows prices. */
export default async function PackingOrderPage({ params }: PageProps<"/staff/packing/[id]">) {
  const { id } = await params;
  const user = await requirePerm("internal", "packing");
  const t = await getTranslations("packing");
  const tb = await getTranslations("orderBreakdown");
  const locale = await getLocale();
  const data = await readAs(user, async (tx) => {
    const [o] = await tx`select id, order_no, customer_name, status, delivery_date, time_window, delivery_method, notes
      from app.v_orders where id = ${id} and deleted_at is null`;
    if (!o) return null;
    const items = await tx`select i.id, i.product_id, i.product_name, i.sku, i.qty, i.unit, i.is_free, i.packed_qty, i.photo_path, i.storage,
        i.name_zh_hans, i.name_zh_hant, i.name_tl,
        p.packing_instruction, p.packing_instruction_zh_hans, p.packing_instruction_zh_hant, p.packing_instruction_tl, p.packing_photo_path
      from app.v_order_items i left join app.v_products p on p.id = i.product_id
      where i.order_id = ${id} and i.deleted_at is null order by i.sort`;
    const checks = await tx`select c.id, c.order_item_id, c.check_type, c.required_qty, c.checked,
        b.batch_no, b.location, b.expiry_date, m.name as m_name, m.name_zh_hans as m_zh_hans, m.name_zh_hant as m_zh_hant, m.name_tl as m_tl,
        m.unit as m_unit, m.photo_path as m_photo
      from app.order_packing_checks c left join app.batches b on b.id = c.batch_id left join app.packaging_materials m on m.id = c.material_id
      where c.order_id = ${id} and c.deleted_at is null order by c.check_type desc, b.expiry_date nulls last, m.name`;
    return { o, items, checks };
  });
  if (!data) notFound();
  const { o, items, checks } = data;
  const packItems: PackItem[] = items.map((i) => ({
    id: String(i.id), name: localName(i, locale) || String(i.product_name), sku: String(i.sku ?? ""), qty: Number(i.qty), unit: String(i.unit),
    isFree: Boolean(i.is_free), storage: String(i.storage ?? ""), photo: publicUrl(i.photo_path as string | null),
    instruction: localName(i, locale, "packing_instruction") || null, packingPhoto: publicUrl(i.packing_photo_path as string | null),
    checks: checks.filter((c) => c.order_item_id === i.id).map((c) => ({
      id: String(c.id), type: c.check_type as "pick" | "material", required: Number(c.required_qty), checked: Boolean(c.checked),
      label: c.check_type === "pick"
        ? (c.batch_no ? `${c.batch_no}` : t("noBatch"))
        : (locale === "zh-Hans" ? c.m_zh_hans : locale === "zh-Hant" ? c.m_zh_hant : locale === "tl" ? c.m_tl : null) as string || String(c.m_name),
      sub: c.check_type === "pick" ? [c.location ? (["freezer_1", "freezer_2", "chiller", "shelf"].includes(String(c.location)) ? t(`location.${c.location}`) : String(c.location)) : null, c.expiry_date ? `${t("expires")} ${date(c.expiry_date as string, locale)}` : null].filter(Boolean).join(" · ") : String(c.m_unit ?? ""),
      photo: c.check_type === "material" ? publicUrl(c.m_photo as string | null) : null,
    })),
  }));
  return (
    <>
      <PageHeader back="/staff/packing"
        title={<span className="flex flex-wrap items-center gap-2">{String(o.order_no)} <StatusBadge status={String(o.status)} /></span>}
        subtitle={<>{String(o.customer_name)} · 📅 {date(o.delivery_date as string, locale)}{o.time_window ? ` · ${o.time_window}` : ""} · {tb(String(o.delivery_method))}</>} />
      {o.notes ? <p className="card mb-4">📝 {String(o.notes)}</p> : null}
      <PackingScreen orderId={id} status={String(o.status)} items={packItems} canPack={can(user.perms, "packing", 3)} />
    </>
  );
}
