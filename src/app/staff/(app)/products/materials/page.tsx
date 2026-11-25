import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { localName, peso, qty } from "@/lib/format";
import { publicUrl } from "@/lib/storage";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { MaterialForm } from "./MaterialForm";

export const metadata = { title: "Packaging materials" };

export default async function MaterialsPage() {
  const user = await requirePerm("internal", "products");
  const t = await getTranslations("products");
  const locale = await getLocale();
  const showQty = fieldOn(user.perms, "stock_qty");
  const showCost = fieldOn(user.perms, "cost");
  const rows = await readAs(user, (tx) => tx`
    select id, code, name, name_zh_hans, name_zh_hant, name_tl, unit, low_stock_level, photo_path, active,
      case when ${showCost} then cost end as cost, app.material_stock(id) as stock
    from app.packaging_materials where deleted_at is null order by name`);
  const canEdit = can(user.perms, "products", 3);
  return (
    <>
      <PageHeader title={t("materials")} back="/staff/products" actions={<Link className="btn-secondary" href="/staff/products/categories">{t("categories")}</Link>} />
      {can(user.perms, "products", 2) && (
        <details className="card mb-4">
          <summary className="cursor-pointer font-bold">+ {t("addMaterial")}</summary>
          <div className="mt-3"><MaterialForm material={null} showCost={showCost} /></div>
        </details>
      )}
      {rows.length === 0 ? <Empty>{t("noMaterials")}</Empty> : (
        <div className="grid gap-3">
          {rows.map((m) => {
            const stock = Number(m.stock);
            const low = Number(m.low_stock_level) > 0 && stock <= Number(m.low_stock_level);
            const photo = publicUrl(m.photo_path as string | null);
            return (
              <details key={String(m.id)} className="card">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                  {photo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={photo} alt="" className="h-12 w-12 rounded-lg object-cover" />
                    : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-cream text-2xl">📦</span>}
                  <span className="flex-1">
                    <b>{localName(m, locale)}</b> <span className="text-xs text-brown/60">{String(m.code)}</span>
                    {!m.active && <span className="ml-2 rounded bg-brown/10 px-2 text-xs">{t("inactive")}</span>}
                  </span>
                  <span className={low ? "font-bold text-st-problem" : ""}>
                    {showQty ? `${qty(stock)} ${String(m.unit)}` : low ? t("lowStock") : t("inStock")}
                  </span>
                  {showCost && m.cost !== null && <span className="text-sm text-brown/60">{peso(m.cost as number)}</span>}
                </summary>
                {canEdit && (
                  <div className="mt-4 border-t border-brown/10 pt-4">
                    <MaterialForm material={{ ...m, id: String(m.id) }} showCost={showCost} />
                    {can(user.perms, "products", 4) && <div className="mt-3"><ConfirmDelete table="packaging_materials" id={String(m.id)} name={String(m.name)} /></div>}
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
