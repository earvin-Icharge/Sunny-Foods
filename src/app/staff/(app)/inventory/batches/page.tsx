import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { fieldOn } from "@/lib/perms";
import { date, localName, qty } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { InventoryTabs } from "../InventoryTabs";

export const metadata = { title: "Batches" };

// Batches with expiry + location (FEFO: oldest expiry first).
export default async function BatchesPage({ searchParams }: PageProps<"/staff/inventory/batches">) {
  const user = await requirePerm("internal", "inventory");
  const t = await getTranslations("inventory");
  const locale = await getLocale();
  const sp = await searchParams;
  const product = typeof sp.product === "string" ? sp.product : "";
  const showEmpty = sp.empty === "1";
  const showQty = fieldOn(user.perms, "stock_qty");
  const rows = await readAs(user, async (tx) => {
    const [s] = await tx`select app.today()::text as today, (app.today() + app.setting_num('expiry_alert_days', 14)::int)::text as soon`;
    const list = await tx`select s.*, coalesce(p.name, m.name) as item_name, p.name_zh_hans, p.name_zh_hant, p.name_tl,
        coalesce(p.unit, m.unit) as unit
      from app.v_batch_stock s left join app.products p on p.id = s.product_id left join app.packaging_materials m on m.id = s.material_id
      where (${product} = '' or s.product_id::text = ${product}) and (${showEmpty} or s.qty > 0)
      order by s.item_type, s.expiry_date nulls last, s.batch_no`;
    return { list, today: String(s.today), soon: String(s.soon) };
  });
  const { today, soon } = rows;
  return (
    <>
      <PageHeader title={t("tabBatches")} />
      <InventoryTabs active="/staff/inventory/batches" />
      <form className="mb-3 flex items-center gap-3 text-sm">
        {product && <input type="hidden" name="product" value={product} />}
        <label className="flex items-center gap-2"><input type="checkbox" name="empty" value="1" defaultChecked={showEmpty} /> {t("showEmptyBatches")}</label>
        <button className="btn-secondary btn-sm">{t("filter")}</button>
      </form>
      {rows.list.length === 0 ? <Empty>{t("noBatches")}</Empty> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>{t("item")}</th><th>{t("batchNo")}</th><th>{t("location")}</th><th>{t("productionDate")}</th><th>{t("expiryDate")}</th>{showQty && <th className="text-right">{t("onHand")}</th>}</tr></thead>
            <tbody>
              {rows.list.map((b) => {
                const exp = b.expiry_date ? String(b.expiry_date instanceof Date ? (b.expiry_date as Date).toISOString().slice(0, 10) : b.expiry_date).slice(0, 10) : null;
                const expired = exp !== null && exp < today;
                const expSoon = exp !== null && !expired && exp <= soon;
                return (
                  <tr key={String(b.batch_id)} className={expired ? "bg-st-problem/10" : expSoon ? "bg-st-packing/10" : ""}>
                    <td className="font-semibold">{b.item_type === "material" ? "📦 " : ""}{b.item_type === "product" ? localName({ ...b, name: b.item_name }, locale) : String(b.item_name)}</td>
                    <td>{String(b.batch_no)}</td>
                    <td>{t.has(`loc_${b.location}`) ? t(`loc_${b.location}`) : String(b.location)}</td>
                    <td>{date(b.production_date as string, locale)}</td>
                    <td className={expired ? "font-bold text-st-problem" : expSoon ? "font-bold text-st-packing" : ""}>
                      {date(exp, locale)} {expired ? `· ${t("expired")}` : expSoon ? `· ${t("expiresSoon")}` : ""}
                    </td>
                    {showQty && <td className="text-right font-semibold">{qty(b.qty as number)} {String(b.unit ?? "")}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
