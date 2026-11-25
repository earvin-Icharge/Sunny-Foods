import Image from "next/image";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { SessionUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { date, localName, peso, qty } from "@/lib/format";
import { OrderBreakdown, type Discount } from "./OrderBreakdown";
import { PrintButton } from "./PrintButton";

/**
 * Print-friendly A4 documents (Spec 7.5):
 * - kind "receipt": delivery receipt WITH prices + "not valid for claim of input tax" line (not a BIR invoice)
 * - kind "picking": picking list WITHOUT prices, with batch/location to take from (FEFO)
 * Works for staff and for the customer portal (row access is checked by the database).
 */
export async function DeliveryReceipt({ user, orderId, kind }: { user: SessionUser; orderId: string; kind: "receipt" | "picking" }) {
  const t = await getTranslations("orderBreakdown");
  const locale = await getLocale();
  const portal = user.area !== "internal";
  const data = await asUser(user.id, async (tx) => {
    const [o] = portal
      ? await tx`select o.*, c.name as customer_name, c.contact_person, c.phone as customer_phone from app.v_portal_orders o join app.customers c on c.id = o.customer_id where o.id = ${orderId}`
      : await tx`select * from app.v_orders where id = ${orderId}`;
    if (!o) return null;
    const items = await tx`select * from app.v_order_items where order_id = ${orderId} and deleted_at is null order by sort`;
    const discounts = await tx`select kind, label, code, amount, affects_total from app.order_discounts where order_id = ${orderId} and deleted_at is null`;
    const picks = kind === "picking" ? await tx`
      select c.order_item_id, c.required_qty, b.batch_no, b.location, b.expiry_date from app.order_packing_checks c
      left join app.batches b on b.id = c.batch_id where c.order_id = ${orderId} and c.check_type = 'pick' and c.deleted_at is null` : [];
    const fefo = kind === "picking" && picks.length === 0 ? await tx`
      select i.id as order_item_id, f.take_qty as required_qty, f.batch_no, f.location, f.expiry_date
      from app.order_items i cross join lateral app.fefo_pick(i.product_id, i.qty) f where i.order_id = ${orderId} and i.deleted_at is null` : [];
    const [s] = await tx`select app.setting('company') as company, app.setting('receipt_footer') as footer, app.setting('prices_include_vat') as incl`;
    return { o, items, discounts, picks: [...picks, ...fefo], s };
  });
  if (!data) notFound();
  const { o, items, discounts, picks, s } = data;
  const company = (s.company ?? {}) as Record<string, string>;
  const showPrices = kind === "receipt" && o.total !== null && o.total !== undefined;
  return (
    <div className="mx-auto max-w-[800px] bg-white p-6 text-[13px] text-black print:p-0">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
        <div>
          <Image src="/logo.png" alt="Sunny Foods" width={150} height={75} />
          <div className="mt-1 text-xs">{company.name} · {company.address}{company.tin ? ` · TIN ${company.tin}` : ""}{company.phone ? ` · ${company.phone}` : ""}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold uppercase">{kind === "receipt" ? t("receiptTitle") : t("pickingTitle")}</div>
          <div>{t("orderNo")}: <b>{String(o.order_no)}</b></div>
          <div>{date(o.created_at as string, locale)}</div>
          {kind === "receipt" && o.bir_invoice_no ? <div>{t("birInvoice")}: {String(o.bir_invoice_no)}</div> : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div><div className="text-xs uppercase text-gray-500">{t("customer")}</div><b>{String(o.customer_name)}</b>
          {o.contact_person ? <div>{String(o.contact_person)}</div> : null}{o.customer_phone ? <div>{String(o.customer_phone)}</div> : null}</div>
        <div><div className="text-xs uppercase text-gray-500">{t("deliverTo")}</div>{String(o.delivery_address ?? "—")}</div>
        <div>{t("deliveryDate")}: <b>{date(o.delivery_date as string, locale)}</b> {o.time_window ? `· ${o.time_window}` : ""}</div>
        <div>{t("method")}: {t(String(o.delivery_method))}{o.courier_name ? ` (${o.courier_name})` : ""} · {t("payment")}: {t(String(o.payment_method))}</div>
      </div>
      <table className="mt-4 w-full border-collapse">
        <thead><tr className="border-b border-black text-left">
          <th className="py-1">{t("item")}</th><th className="py-1 text-right">{t("qty")}</th>
          {kind === "picking" && <th className="py-1">{t("batch")}</th>}
          {kind === "picking" && <th className="py-1 text-center">{t("checked")}</th>}
          {showPrices && <><th className="py-1 text-right">{t("unitPrice")}</th><th className="py-1 text-right">{t("amount")}</th></>}
        </tr></thead>
        <tbody>
          {items.map((i) => {
            const itemPicks = picks.filter((p) => p.order_item_id === i.id);
            return (
              <tr key={String(i.id)} className="border-b border-gray-300 align-top">
                <td className="py-1.5">{localName(i, locale, "product_name") || String(i.product_name)} {i.is_free ? <b>({t("freeItem")})</b> : null}<div className="text-xs text-gray-500">{String(i.sku ?? "")}</div></td>
                <td className="py-1.5 text-right">{qty(i.qty as number)} {String(i.unit)}</td>
                {kind === "picking" && <td className="py-1.5 text-xs">{itemPicks.map((p, k) => <div key={k}>{p.batch_no ? `${p.batch_no} · ${p.location} · ${qty(p.required_qty as number)}` : `— ${qty(p.required_qty as number)}`}</div>)}</td>}
                {kind === "picking" && <td className="py-1.5 text-center">☐</td>}
                {showPrices && <><td className="py-1.5 text-right">{peso(i.unit_price as number)}</td><td className="py-1.5 text-right">{peso(i.line_total as number)}</td></>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {showPrices && (
        <div className="ml-auto mt-3 w-full max-w-xs">
          <OrderBreakdown totals={{ subtotal: o.subtotal as number, delivery_fee: o.delivery_fee as number, vatable_sales: o.vatable_sales as number,
            vat_exempt_sales: o.vat_exempt_sales as number, vat_amount: o.vat_amount as number, total: o.total as number,
            paid_amount: o.paid_amount as number, prices_include_vat: s.incl !== false }} discounts={discounts as unknown as Discount[]} />
        </div>
      )}
      {o.notes ? <p className="mt-3 text-xs">📝 {String(o.notes)}</p> : null}
      <div className="mt-10 grid grid-cols-2 gap-8 text-xs">
        <div className="border-t border-black pt-1">{t("preparedBy")}</div>
        <div className="border-t border-black pt-1">{t("receivedBy")}</div>
      </div>
      {kind === "receipt" && <p className="mt-6 border-2 border-black p-2 text-center font-bold uppercase">{String(s.footer ?? "")}</p>}
    </div>
  );
}
