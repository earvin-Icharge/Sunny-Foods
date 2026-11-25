import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { localName, todayManila } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { InventoryTabs } from "../InventoryTabs";
import { StockForm } from "../StockForm";

export const metadata = { title: "Stock in" };

export default async function StockInPage() {
  const user = await requirePerm("internal", "inventory", 2);
  const t = await getTranslations("inventory");
  const locale = await getLocale();
  const items = await readAs(user, async (tx) => ({
    products: await tx`select id, name, name_zh_hans, name_zh_hant, name_tl, sku, unit, storage from app.products where deleted_at is null and active order by name`,
    materials: await tx`select id, name, name_zh_hans, name_zh_hant, name_tl, code as sku, unit from app.packaging_materials where deleted_at is null and active order by name`,
  }));
  return (
    <>
      <PageHeader title={t("tabStockIn")} />
      <InventoryTabs active="/staff/inventory/stock-in" />
      <StockForm mode="in" today={todayManila()}
        products={items.products.map((p) => ({ id: String(p.id), label: `${localName(p, locale)} (${p.sku})`, unit: String(p.unit), storage: String(p.storage) }))}
        materials={items.materials.map((p) => ({ id: String(p.id), label: `${localName(p, locale)} (${p.sku})`, unit: String(p.unit) }))}
        batches={[]} />
    </>
  );
}
