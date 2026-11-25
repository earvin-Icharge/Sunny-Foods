import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { date, dateTime, localName, peso, qty } from "@/lib/format";
import { fileUrl, publicUrl } from "@/lib/storage";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AuditHistory } from "@/components/ui/AuditHistory";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { OrderBreakdown, type Discount } from "@/components/orders/OrderBreakdown";
import { OrderActions, AssignDriverForm, BirInvoiceField } from "./OrderActions";
import { RecordPaymentForm } from "../RecordPaymentForm";

export const metadata = { title: "Order" };

export default async function OrderPage({ params }: PageProps<"/staff/orders/[id]">) {
  const { id } = await params;
  const user = await requirePerm("internal", "orders");
  const t = await getTranslations("orders");
  const tb = await getTranslations("orderBreakdown");
  const ts = await getTranslations("status");
  const locale = await getLocale();
  const p = user.perms;
  const showMoney = fieldOn(p, "price");
  const seeAgents = can(p, "agents");
  const data = await readAs(user, async (tx) => {
    const [o] = await tx`select * from app.v_orders where id = ${id} and deleted_at is null`;
    if (!o) return null;
    const items = await tx`select * from app.v_order_items where order_id = ${id} and deleted_at is null order by sort`;
    const discounts = await tx`select kind, label, code, amount, affects_total from app.order_discounts where order_id = ${id} and deleted_at is null`;
    const [placer] = await tx`select full_name from app.profiles where id = ${o.placed_by as string}`;
    const payments = can(p, "payments") ? await tx`select id, amount, method, paid_at, reference, proof_path, notes, created_at from app.payments
      where order_id = ${id} and deleted_at is null order by paid_at, created_at` : [];
    const commissions = seeAgents ? await tx`select c.amount, c.status, c.share_pct, c.rate, c.rate_kind, a.name as agent_name
      from app.commissions c join app.agents a on a.id = c.agent_id where c.order_id = ${id} and c.status <> 'voided' order by a.name` : [];
    const drivers = can(p, "deliveries", 3) && p.modules.deliveries.scope === "all"
      ? await tx`select id, full_name from app.profiles where role_key = 'driver' and active and deleted_at is null order by full_name` : [];
    const [s] = await tx`select app.setting('prices_include_vat') as incl`;
    return { o, items, discounts, placer, payments, commissions, drivers, incl: s.incl !== false };
  });
  if (!data) notFound();
  const { o, items, discounts, payments, commissions, drivers } = data;
  const status = String(o.status);
  const editable = ["new", "confirmed"].includes(status) && can(p, "orders", 3);
  const [packPhoto, proofPhoto] = await Promise.all([fileUrl(o.packing_photo_path as string), fileUrl(o.delivery_proof_path as string)]);
  const paymentUrls = await Promise.all(payments.map((x) => fileUrl(x.proof_path as string)));
  const mapUrl = o.lat && o.lng ? `https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}`
    : o.delivery_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(o.delivery_address))}` : null;
  const balance = o.total !== null ? Number(o.total) - Number(o.paid_amount ?? 0) : null;
  const ddate = o.delivery_date ? new Date(o.delivery_date as string).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : "";

  return (
    <>
      <PageHeader back="/staff/orders"
        title={<span className="flex flex-wrap items-center gap-2">{String(o.order_no)} <StatusBadge status={status} /> <StatusBadge kind="payment" status={String(o.payment_status)} /></span>}
        subtitle={<>{t(`source.${o.source}`)} · {dateTime(o.created_at as string, locale)}{data.placer ? ` · ${t("placedBy")} ${data.placer.full_name}` : ""}</>}
        actions={<>
          <Link className="btn-secondary btn-sm" href={`/staff/orders/${id}/picking`}>🖨️ {t("pickingList")}</Link>
          {showMoney && <Link className="btn-secondary btn-sm" href={`/staff/orders/${id}/receipt`}>🧾 {t("deliveryReceipt")}</Link>}
          {editable && <Link className="btn-secondary btn-sm" href={`/staff/orders/${id}/edit`}>✏️ {t("edit")}</Link>}
          {["new", "cancelled"].includes(status) && can(p, "orders", 4) && <ConfirmDelete table="orders" id={id} name={String(o.order_no)} />}
        </>} />

      <div className="card mb-4">
        <OrderActions orderId={id} status={status} method={String(o.delivery_method)}
          canConfirm={can(p, "orders", 3)} canPack={can(p, "packing", 3) || can(p, "orders", 3)} canDispatch={can(p, "deliveries", 3)}
          canComplete={can(p, "orders", 3)} canCancel={can(p, "orders", 3)} />
        {status === "cancelled" && o.cancel_reason ? <p className="mt-3 text-st-problem">{t("cancelReason")}: {String(o.cancel_reason)}</p> : null}
        {o.changed_by_staff ? <p className="mt-2 text-sm text-brown/60">{t("changedByStaff")}</p> : null}
        {o.manual_discount_flagged ? <p className="mt-2 rounded-lg bg-gold/20 p-2 text-sm">⚑ {t("manualDiscountFlagged", { reason: String(o.manual_discount_reason ?? "") })}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="grid min-w-0 gap-4">
          <section className="card grid gap-3 sm:grid-cols-2">
            <Info label={t("customer")}><Link className="font-semibold text-sunny" href={`/staff/customers/${o.customer_id}`}>{String(o.customer_name)}</Link>
              {o.contact_person ? <div>{String(o.contact_person)}</div> : null}
              {o.customer_phone ? <a className="text-sunny" href={`tel:${o.customer_phone}`}>📞 {String(o.customer_phone)}</a> : null}</Info>
            <Info label={t("address")}>{String(o.delivery_address ?? "—")}{mapUrl && <div><a className="text-sunny" href={mapUrl} target="_blank" rel="noreferrer">📍 {t("openMap")}</a></div>}</Info>
            <Info label={t("deliveryDate")}>{date(o.delivery_date as string, locale)}{o.time_window ? ` · ${o.time_window}` : ""}</Info>
            <Info label={t("deliveryMethod")}>{tb(String(o.delivery_method))}{o.courier_name ? ` (${o.courier_name})` : ""}</Info>
            <Info label={t("paymentMethod")}>{tb(String(o.payment_method))}</Info>
            <Info label={t("paymentStatus")}>{ts(String(o.payment_status))}{o.due_date ? ` · ${t("due")} ${date(o.due_date as string, locale)}` : ""}</Info>
            {o.notes ? <Info label={t("notesCustomer")}>{String(o.notes)}</Info> : null}
            {o.internal_notes ? <Info label={t("internalNotes")}>{String(o.internal_notes)}</Info> : null}
            {o.agent_name && seeAgents ? <Info label={t("agent")}>{String(o.agent_name)}</Info> : null}
          </section>

          <section className="card">
            <h2 className="mb-3 text-lg font-bold">{t("items")}</h2>
            <ul className="grid gap-2">
              {items.map((i) => {
                const photo = publicUrl(i.photo_path as string | null);
                return (
                  <li key={String(i.id)} className="flex items-center gap-3 rounded-xl bg-cream-light p-2">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cream">
                      {photo ? <Image src={photo} alt="" fill sizes="48px" className="object-cover" /> : <span className="flex h-full items-center justify-center">🥩</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{localName(i, locale) || String(i.product_name)} {i.is_free ? <b className="text-st-ok">({tb("freeItem")})</b> : null}</div>
                      <div className="text-xs text-brown/60">{String(i.sku ?? "")}{i.packed_qty !== null && Number(i.packed_qty) !== Number(i.qty) ? ` · ${t("packedQty")}: ${qty(i.packed_qty as number)}` : ""}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">× {qty(i.qty as number)} {String(i.unit)}</div>
                      {showMoney && <div className="text-sm text-brown/70">{peso(i.unit_price as number)} · {peso(i.line_total as number)}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {(can(p, "deliveries", 3) && p.modules.deliveries.scope === "all" && ["confirmed", "packing", "packed", "out_for_delivery"].includes(status) && o.delivery_method !== "pickup") || o.driver_name || proofPhoto || packPhoto ? (
            <section className="card grid gap-3">
              <h2 className="text-lg font-bold">{t("delivery")}</h2>
              {o.driver_name ? <p>🚚 {String(o.driver_name)}{o.scheduled_date ? ` · ${date(o.scheduled_date as string, locale)}` : ""}{o.delivery_status ? ` · ${t(`deliveryStatus.${o.delivery_status}`)}` : ""}</p> : null}
              {o.cod_collected !== null && o.cod_collected !== undefined && showMoney ? <p>{t("codCollected")}: {peso(o.cod_collected as number)}</p> : null}
              {drivers.length > 0 && ["confirmed", "packing", "packed", "out_for_delivery"].includes(status) && o.delivery_method !== "pickup" && (
                <AssignDriverForm orderId={id} drivers={drivers.map((d) => ({ id: String(d.id), name: String(d.full_name) }))}
                  current={(o.driver_id as string) ?? null} date={(o.scheduled_date ? new Date(o.scheduled_date as string).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : ddate)} />
              )}
              <div className="flex flex-wrap gap-3">
                {packPhoto && <a href={packPhoto} target="_blank" rel="noreferrer" className="text-center text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={packPhoto} alt="" className="h-32 rounded-lg object-cover" />{t("packingPhoto")}</a>}
                {proofPhoto && <a href={proofPhoto} target="_blank" rel="noreferrer" className="text-center text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proofPhoto} alt="" className="h-32 rounded-lg object-cover" />{t("deliveryProof")}</a>}
              </div>
            </section>
          ) : null}

          {can(p, "payments") && (
            <section className="card grid gap-3">
              <h2 className="text-lg font-bold">{t("payments")}</h2>
              {payments.length === 0 && <p className="text-sm text-brown/60">{t("noPayments")}</p>}
              <ul className="grid gap-1 text-sm">
                {payments.map((x, k) => (
                  <li key={String(x.id)} className="flex flex-wrap justify-between gap-2 border-b border-brown/5 py-1">
                    <span>{date(x.paid_at as string, locale)} · {tb(String(x.method === "adjustment" ? "cash" : x.method))}{x.reference ? ` · ${x.reference}` : ""}
                      {paymentUrls[k] && <> · <a className="text-sunny" href={paymentUrls[k]!} target="_blank" rel="noreferrer">{t("proof")}</a></>}</span>
                    {showMoney && <b>{peso(x.amount as number)}</b>}
                  </li>
                ))}
              </ul>
              {can(p, "payments", 2) && showMoney && status !== "cancelled" && String(o.payment_status) !== "paid" && <RecordPaymentForm orderId={id} balance={balance} compact />}
            </section>
          )}
        </div>

        <aside className="grid content-start gap-4">
          {showMoney && (
            <section className="card">
              <h2 className="mb-3 text-lg font-bold">{t("priceBreakdown")}</h2>
              <OrderBreakdown discounts={discounts as unknown as Discount[]} totals={{ subtotal: o.subtotal as number, delivery_fee: o.delivery_fee as number,
                vatable_sales: o.vatable_sales as number, vat_exempt_sales: o.vat_exempt_sales as number, vat_amount: o.vat_amount as number,
                total: o.total as number, paid_amount: o.paid_amount as number, prices_include_vat: data.incl }} />
            </section>
          )}
          {seeAgents && commissions.length > 0 && (
            <section className="card">
              <h2 className="mb-2 text-lg font-bold">{t("commission")}</h2>
              <ul className="grid gap-1 text-sm">
                {commissions.map((c, k) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span>{String(c.agent_name)}{Number(c.share_pct) < 100 ? ` (${c.share_pct}%)` : ""} · {ts(String(c.status))}</span>
                    <b>{peso(c.amount as number)}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {can(p, "orders", 3) && <section className="card"><BirInvoiceField orderId={id} value={String(o.bir_invoice_no ?? "")} /></section>}
        </aside>
      </div>
      <AuditHistory user={user} table="orders" id={id} />
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-xs font-semibold uppercase text-brown/50">{label}</div><div>{children}</div></div>;
}
