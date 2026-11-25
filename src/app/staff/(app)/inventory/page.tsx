import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { dateTime, localName, qty } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InventoryTabs } from "./InventoryTabs";
import { DecideButtons } from "./DecideButtons";

export const metadata = { title: "Stock" };

// Stock on hand (Spec 7.3): meat/sauce products and packaging materials.
export default async function InventoryPage() {
  const user = await requirePerm("internal", "inventory");
  const t = await getTranslations("inventory");
  const locale = await getLocale();
  const showQty = fieldOn(user.perms, "stock_qty");
  const isBoss = can(user.perms, "inventory", 5);
  const data = await readAs(user, async (tx) => {
    const products = await tx`select id, sku, name, name_zh_hans, name_zh_hant, name_tl, unit, storage, low_stock_level, stock_qty, stock_badge,
        app.product_reserved(id) as reserved
      from app.v_products where deleted_at is null and archived_at is null order by category_name nulls last, name`;
    const materials = await tx`select id, code, name, name_zh_hans, name_zh_hant, name_tl, unit, low_stock_level,
        case when ${showQty} then app.material_stock(id) end as stock, app.material_stock(id) <= low_stock_level and low_stock_level > 0 as low
      from app.packaging_materials where deleted_at is null and active order by name`;
    const pending = isBoss ? await tx`select m.id, m.qty, m.kind, m.reason, m.created_at, coalesce(p.name, pm.name) as item, pr.full_name as who
      from app.stock_movements m left join app.products p on p.id = m.product_id left join app.packaging_materials pm on pm.id = m.material_id
      left join app.profiles pr on pr.id = m.created_by
      where m.status = 'pending_approval' and m.deleted_at is null order by m.created_at` : [];
    return { products, materials, pending };
  });
  return (
    <>
      <PageHeader title={t("title")} actions={can(user.perms, "inventory", 2) && <>
        <Link className="btn-primary" href="/staff/inventory/stock-in">+ {t("tabStockIn")}</Link>
        <Link className="btn-secondary" href="/staff/inventory/adjust">{t("tabAdjust")}</Link>
      </>} />
      <InventoryTabs active="/staff/inventory" />

      {data.pending.length > 0 && (
        <section className="card mb-5 ring-2 ring-gold">
          <h2 className="mb-2 text-lg font-bold">{t("pendingApproval")}</h2>
          <ul className="grid gap-2">
            {data.pending.map((m) => (
              <li key={String(m.id)} className="flex flex-wrap items-center gap-3 rounded-xl bg-cream-light p-3">
                <div className="flex-1">
                  <b>{String(m.item)}</b> · {t(`kind_${m.kind}`)} <b className={Number(m.qty) < 0 ? "text-st-problem" : "text-st-ok"}>{Number(m.qty) > 0 ? "+" : ""}{qty(m.qty as number)}</b>
                  <div className="text-sm text-brown/70">{String(m.reason)} — {String(m.who ?? "")} · {dateTime(m.created_at as string, locale)}</div>
                </div>
                <DecideButtons id={String(m.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-2 text-lg font-bold">{t("products")}</h2>
      <div className="card table-wrap mb-6">
        <table className="table">
          <thead><tr><th>{t("item")}</th><th>{t("storage")}</th><th className="text-right">{showQty ? t("onHand") : t("status")}</th>{showQty && <th className="text-right">{t("reserved")}</th>}<th className="text-right">{t("lowLevel")}</th></tr></thead>
          <tbody>
            {data.products.map((p) => (
              <tr key={String(p.id)}>
                <td><Link href={`/staff/inventory/batches?product=${p.id}`} className="font-semibold">{localName(p, locale)}</Link><div className="text-xs text-brown/60">{String(p.sku)}</div></td>
                <td>{t(`storage_${p.storage}`)}</td>
                <td className="text-right">{showQty
                  ? <span className={p.stock_badge !== "available" ? "font-bold text-st-problem" : "font-semibold"}>{qty(p.stock_qty as number)} {String(p.unit)}</span>
                  : <StatusBadge kind="stock" status={String(p.stock_badge)} />}</td>
                {showQty && <td className="text-right text-brown/70">{qty(p.reserved as number)}</td>}
                <td className="text-right text-brown/70">{qty(p.low_stock_level as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-bold">{t("packaging")}</h2>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>{t("item")}</th><th className="text-right">{showQty ? t("onHand") : t("status")}</th><th className="text-right">{t("lowLevel")}</th></tr></thead>
          <tbody>
            {data.materials.map((m) => (
              <tr key={String(m.id)}>
                <td><b>{localName(m, locale)}</b><div className="text-xs text-brown/60">{String(m.code)}</div></td>
                <td className="text-right">{showQty
                  ? <span className={m.low ? "font-bold text-st-problem" : "font-semibold"}>{qty(m.stock as number)} {String(m.unit)}</span>
                  : <StatusBadge kind="stock" status={m.low ? "limited" : "available"} />}</td>
                <td className="text-right text-brown/70">{qty(m.low_stock_level as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
