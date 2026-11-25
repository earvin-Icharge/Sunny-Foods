import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { fieldOn } from "@/lib/perms";
import { date, localName, qty, todayManila } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { InventoryTabs } from "../InventoryTabs";
import { StockForm } from "../StockForm";

export const metadata = { title: "Adjust stock" };

export default async function AdjustPage() {
  const user = await requirePerm("internal", "inventory", 2);
  const t = await getTranslations("inventory");
  const locale = await getLocale();
  const showQty = fieldOn(user.perms, "stock_qty");
  const items = await readAs(user, async (tx) => ({
    products: await tx`select id, name, name_zh_hans, name_zh_hant, name_tl, sku, unit from app.products where deleted_at is null order by name`,
    materials: await tx`select id, name, name_zh_hans, name_zh_hant, name_tl, code as sku, unit from app.packaging_materials where deleted_at is null order by name`,
    batches: await tx`select batch_id, product_id, material_id, batch_no, location, expiry_date, qty from app.v_batch_stock where qty > 0 order by expiry_date nulls last`,
  }));
  return (
    <>
      <PageHeader title={t("tabAdjust")} subtitle={t("adjustHelp")} />
      <InventoryTabs active="/staff/inventory/adjust" />
      <StockForm mode="adjust" today={todayManila()}
        products={items.products.map((p) => ({ id: String(p.id), label: `${localName(p, locale)} (${p.sku})`, unit: String(p.unit) }))}
        materials={items.materials.map((p) => ({ id: String(p.id), label: `${localName(p, locale)} (${p.sku})`, unit: String(p.unit) }))}
        batches={items.batches.map((b) => ({
          id: String(b.batch_id), itemId: String(b.product_id ?? b.material_id),
          label: `${b.batch_no} · ${b.location} · ${t("exp")} ${date(b.expiry_date as string, locale)}${showQty ? ` · ${qty(b.qty as number)}` : ""}`,
        }))} />
    </>
  );
}
