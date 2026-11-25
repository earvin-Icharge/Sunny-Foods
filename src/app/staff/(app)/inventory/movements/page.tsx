import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { fieldOn } from "@/lib/perms";
import { dateTime, qty } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { Input, Select } from "@/components/ui/Field";
import { InventoryTabs } from "../InventoryTabs";

export const metadata = { title: "Stock movements" };
const KINDS = ["stock_in", "order_out", "adjustment", "spoilage", "return", "count"];

// Every stock change is a movement record (Spec 7.3).
export default async function MovementsPage({ searchParams }: PageProps<"/staff/inventory/movements">) {
  const user = await requirePerm("internal", "inventory");
  const t = await getTranslations("inventory");
  const locale = await getLocale();
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const showQty = fieldOn(user.perms, "stock_qty");
  const rows = await readAs(user, (tx) => tx`
    select m.id, m.created_at, m.kind, m.qty, m.reason, m.status, m.item_type, coalesce(p.name, pm.name) as item, b.batch_no,
      o.order_no, pr.full_name as who
    from app.stock_movements m
    left join app.products p on p.id = m.product_id left join app.packaging_materials pm on pm.id = m.material_id
    left join app.batches b on b.id = m.batch_id left join app.orders o on o.id = m.order_id
    left join app.profiles pr on pr.id = m.created_by
    where m.deleted_at is null and (${kind} = '' or m.kind = ${kind})
      and (${q} = '' or coalesce(p.name, pm.name) ilike ${"%" + q + "%"} or b.batch_no ilike ${"%" + q + "%"} or o.order_no ilike ${"%" + q + "%"})
      and (${from} = '' or (m.created_at at time zone 'Asia/Manila')::date >= ${from || null}::date)
      and (${to} = '' or (m.created_at at time zone 'Asia/Manila')::date <= ${to || null}::date)
    order by m.created_at desc limit 300`);
  return (
    <>
      <PageHeader title={t("tabMovements")} />
      <InventoryTabs active="/staff/inventory/movements" />
      <form className="card mb-4 grid gap-2 sm:grid-cols-5">
        <Input name="q" defaultValue={q} placeholder={t("searchMovements")} className="sm:col-span-2" />
        <Select name="kind" defaultValue={kind}>
          <option value="">{t("allKinds")}</option>
          {KINDS.map((k) => <option key={k} value={k}>{t(`kind_${k}`)}</option>)}
        </Select>
        <Input name="from" type="date" defaultValue={from} />
        <Input name="to" type="date" defaultValue={to} />
        <button className="btn-secondary sm:col-span-5">{t("filter")}</button>
      </form>
      {rows.length === 0 ? <Empty>{t("noMovements")}</Empty> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>{t("when")}</th><th>{t("item")}</th><th>{t("kind")}</th>{showQty && <th className="text-right">{t("quantity")}</th>}<th>{t("details")}</th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={String(m.id)} className={m.status !== "posted" ? "opacity-60" : ""}>
                  <td className="whitespace-nowrap">{dateTime(m.created_at as string, locale)}</td>
                  <td className="font-semibold">{m.item_type === "material" ? "📦 " : ""}{String(m.item ?? "")}{m.batch_no ? <div className="text-xs font-normal text-brown/60">{String(m.batch_no)}</div> : null}</td>
                  <td>{t(`kind_${m.kind}`)}{m.status !== "posted" && <div className="text-xs text-st-packing">{t(`st_${m.status}`)}</div>}</td>
                  {showQty && <td className={`text-right font-bold ${Number(m.qty) < 0 ? "text-st-problem" : "text-st-ok"}`}>{Number(m.qty) > 0 ? "+" : ""}{qty(m.qty as number)}</td>}
                  <td className="text-sm text-brown/70">{m.order_no ? `${m.order_no} · ` : ""}{String(m.reason ?? "")}{m.who ? ` — ${m.who}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
