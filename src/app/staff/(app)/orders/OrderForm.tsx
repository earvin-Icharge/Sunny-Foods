"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { OrderBreakdownClient } from "@/components/orders/OrderBreakdownClient";
import type { Discount } from "@/components/orders/OrderBreakdown";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { peso, qty as fmtQty } from "@/lib/format";
import { customerOptions, editOrder, placeOrder, quoteOrder, type OrderInput } from "./actions";
import { ErrorList } from "./ErrorList";

export type ProductOption = { id: string; name: string; sku: string; unit: string; category: string; photo: string | null; price: number | null; stock: number | null; badge: string };
type CustomerOpt = { id: string; name: string; status: string };
type Quote = {
  ok?: boolean; hidden?: boolean; subtotal?: number; delivery_fee?: number; vatable_sales?: number; vat_exempt_sales?: number; vat_amount?: number; total?: number;
  discounts?: Discount[]; lines?: { product_id: string; product_name: string; qty: number; is_free: boolean; free_reason: string | null; unit: string }[];
  errors?: { code: string; [k: string]: unknown }[]; warnings?: { code: string; name?: string; available?: number; qty?: number }[];
  voucher?: { ok: boolean; reason: string | null; code?: string; min_order?: number } | null; settings?: { prices_include_vat?: boolean };
};

export const PAYMENT_METHODS = ["cash", "cod", "bank_transfer", "gcash", "maya", "cheque", "credit_7", "credit_15", "credit_30", "salary_deduction"];
const COURIERS = ["Lalamove", "Grab", "Transportify"];

export function OrderForm({ mode, orderId, customers, products, timeWindows, canManualDiscount, showPrice, initial }: {
  mode: "new" | "edit"; orderId?: string; customers: CustomerOpt[]; products: ProductOption[]; timeWindows: string[];
  canManualDiscount: boolean; showPrice: boolean; initial?: Partial<OrderInput> & { customer_name?: string };
}) {
  const t = useTranslations("orders");
  const tb = useTranslations("orderBreakdown");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
  const [custSearch, setCustSearch] = useState("");
  const [opts, setOpts] = useState<{ addresses: { id: string; label: string; address: string; is_default: boolean }[]; customer: { status: string; default_delivery_method: string; payment_terms: string } } | null>(null);
  const [items, setItems] = useState<Record<string, number>>(() => Object.fromEntries((initial?.items ?? []).map((i) => [i.product_id, Number(i.qty)])));
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState(initial?.delivery_method ?? "own_truck");
  const [courier, setCourier] = useState(initial?.courier_name ?? "Lalamove");
  const [deliveryDate, setDeliveryDate] = useState(initial?.delivery_date ?? "");
  const [timeWindow, setTimeWindow] = useState(initial?.time_window ?? timeWindows[0] ?? "");
  const [addressId, setAddressId] = useState(initial?.address_id ?? "");
  const [payment, setPayment] = useState(initial?.payment_method ?? "cod");
  const [voucher, setVoucher] = useState(initial?.voucher_code ?? "");
  const [manualAmt, setManualAmt] = useState(initial?.manual_discount?.amount ? String(initial.manual_discount.amount) : "");
  const [manualReason, setManualReason] = useState(initial?.manual_discount?.reason ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [internalNotes, setInternalNotes] = useState(initial?.internal_notes ?? "");
  const [changeNote, setChangeNote] = useState("");
  const [confirmNow, setConfirmNow] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [errors, setErrors] = useState<{ code: string; [k: string]: unknown }[]>([]);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  // load customer details when picked
  useEffect(() => {
    if (!customerId) return;
    let alive = true;
    customerOptions(customerId).then((r) => {
      if (!alive || !r.ok) return;
      setOpts(r.data);
      if (mode === "new") {
        setMethod(r.data.customer.default_delivery_method);
        setPayment(r.data.customer.payment_terms.startsWith("credit") ? r.data.customer.payment_terms : r.data.customer.payment_terms === "cash" ? "cash" : "cod");
        setAddressId(r.data.addresses.find((a) => a.is_default)?.id ?? "");
      }
    });
    return () => { alive = false; };
  }, [customerId, mode]);

  const input = useMemo<OrderInput>(() => ({
    customer_id: customerId,
    items: Object.entries(items).filter(([, q]) => q > 0).map(([product_id, q]) => ({ product_id, qty: q })),
    delivery_method: method, courier_name: method === "courier" ? courier : null, delivery_date: deliveryDate || null,
    time_window: method === "pickup" ? null : timeWindow || null, address_id: addressId || null, payment_method: payment,
    voucher_code: voucher.trim() || null,
    manual_discount: canManualDiscount && Number(manualAmt) > 0 ? { amount: Number(manualAmt), reason: manualReason.trim() || null } : null,
    notes: notes || null, internal_notes: internalNotes || null, confirm_now: confirmNow, change_note: changeNote || null,
  }), [customerId, items, method, courier, deliveryDate, timeWindow, addressId, payment, voucher, manualAmt, manualReason, notes, internalNotes, confirmNow, changeNote, canManualDiscount]);

  // live price breakdown (debounced)
  const quoteKey = JSON.stringify([input.customer_id, input.items, input.delivery_method, input.voucher_code, input.manual_discount]);
  useEffect(() => {
    if (!input.customer_id || input.items.length === 0) return;
    const my = ++seq.current;
    const timer = setTimeout(async () => {
      const r = await quoteOrder(input, mode === "edit" ? orderId : null);
      if (my === seq.current && r.ok) setQuote(r.data as Quote);
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  const filteredCustomers = customers.filter((c) => !custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase())).slice(0, 30);
  const filteredProducts = products.filter((p) => !search || (p.name + " " + p.sku + " " + p.category).toLowerCase().includes(search.toLowerCase()));
  const setQty = (id: string, q: number) => setItems((x) => ({ ...x, [id]: Math.max(0, Math.round(q * 1000) / 1000) }));
  const lowStock = new Map((quote?.warnings ?? []).filter((w) => w.code === "low_stock").map((w) => [w.name, w]));
  const hasItems = input.items.length > 0;

  function submit() {
    setErrors([]);
    if (canManualDiscount && Number(manualAmt) > 0 && !manualReason.trim()) { setErrors([{ code: "manual_discount_reason_required" }]); return; }
    start(async () => {
      const r = mode === "edit" && orderId ? await editOrder(orderId, input) : await placeOrder(input);
      if (!r.ok) { toast.show(r.error, "error"); return; }
      const d = r.data as { ok: boolean; order_id?: string; order_no?: string; errors: { code: string }[] };
      if (!d.ok) { setErrors(d.errors); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      toast.show(mode === "edit" ? t("orderUpdated") : t("orderPlaced", { no: d.order_no ?? "" }));
      router.push(`/staff/orders/${mode === "edit" ? orderId : d.order_id}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="grid min-w-0 gap-5">
        <ErrorList errors={errors} />
        {/* 1. customer */}
        <section className="card">
          <h2 className="mb-3 text-lg font-bold">1. {t("customer")}</h2>
          {mode === "edit" ? <p className="font-semibold">{initial?.customer_name}</p> : (
            <>
              <input className="input" placeholder={t("searchCustomer")} value={custSearch} onChange={(e) => setCustSearch(e.target.value)} />
              <div className="mt-2 grid max-h-56 gap-1 overflow-y-auto">
                {filteredCustomers.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setCustomerId(c.id); setQuote(null); }}
                    className={`flex min-h-12 items-center justify-between rounded-xl px-3 text-left ${customerId === c.id ? "bg-sunny text-white" : "bg-cream-light hover:bg-cream"}`}>
                    <span className="font-semibold">{c.name}</span>
                    {c.status !== "approved" && <span className="text-xs">{t("notApproved")}</span>}
                  </button>
                ))}
                {filteredCustomers.length === 0 && <p className="text-sm text-brown/60">{t("noCustomers")}</p>}
              </div>
            </>
          )}
        </section>

        {/* 2. products */}
        <section className="card">
          <h2 className="mb-3 text-lg font-bold">2. {t("products")}</h2>
          <input className="input mb-3" placeholder={t("searchProduct")} value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((p) => {
              const q = items[p.id] ?? 0;
              const warn = q > 0 && lowStock.get(p.name);
              return (
                <div key={p.id} className={`rounded-xl p-3 ring-1 ${q > 0 ? "bg-cream ring-sunny/40" : "bg-white ring-brown/10"}`}>
                  <div className="flex gap-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-cream">
                      {p.photo ? <Image src={p.photo} alt="" fill sizes="64px" className="object-cover" /> : <span className="flex h-full items-center justify-center text-2xl">🥩</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold leading-tight">{p.name}</div>
                      <div className="text-xs text-brown/60">{p.sku} · {p.unit}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        {showPrice && p.price !== null && <span className="font-semibold">{peso(p.price)}</span>}
                        {p.stock !== null ? <span className="text-brown/70">{t("inStock")}: {fmtQty(p.stock)}</span> : <StatusBadge kind="stock" status={p.badge} />}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" className="btn-secondary btn-sm w-12" onClick={() => setQty(p.id, q - 1)} disabled={q <= 0}>−</button>
                    <input type="number" inputMode="decimal" min="0" step="1" className="input min-h-10 text-center" value={q || ""}
                      placeholder="0" onChange={(e) => setQty(p.id, Number(e.target.value))} />
                    <button type="button" className="btn-secondary btn-sm w-12" onClick={() => setQty(p.id, q + 1)}>+</button>
                  </div>
                  {warn && <p className="mt-1 text-xs font-semibold text-st-problem">⚠ {t("notEnoughStock", { available: fmtQty(warn.available ?? 0) })}</p>}
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. delivery & payment */}
        <section className="card grid gap-4 sm:grid-cols-2">
          <h2 className="text-lg font-bold sm:col-span-2">3. {t("deliveryPayment")}</h2>
          <label><span className="label">{t("deliveryMethod")}</span>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {["own_truck", "courier", "pickup"].map((m) => <option key={m} value={m}>{tb(m)}</option>)}
            </select></label>
          {method === "courier" && (
            <label><span className="label">{t("courier")}</span>
              <select className="input" value={courier} onChange={(e) => setCourier(e.target.value)}>
                {COURIERS.map((c) => <option key={c}>{c}</option>)}
              </select></label>
          )}
          <label><span className="label">{method === "pickup" ? t("pickupDate") : t("deliveryDate")}</span>
            <input className="input" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></label>
          {method !== "pickup" && (
            <label><span className="label">{t("timeWindow")}</span>
              <select className="input" value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)}>
                {timeWindows.map((w) => <option key={w}>{w}</option>)}
              </select></label>
          )}
          {method !== "pickup" && opts && (
            <label className="sm:col-span-2"><span className="label">{t("address")}</span>
              <select className="input" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                <option value="">{t("customerMainAddress")}</option>
                {opts.addresses.map((a) => <option key={a.id} value={a.id}>{a.label}: {a.address}</option>)}
              </select></label>
          )}
          <label><span className="label">{t("paymentMethod")}</span>
            <select className="input" value={payment} onChange={(e) => setPayment(e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{tb(m)}</option>)}
            </select></label>
          <label><span className="label">{t("voucherCode")}</span>
            <input className="input uppercase" value={voucher} onChange={(e) => setVoucher(e.target.value)} placeholder="HOLIDAY10" /></label>
          {quote?.voucher && (
            <p className={`text-sm font-semibold sm:col-span-2 ${quote.voucher.ok ? "text-st-ok" : "text-st-problem"}`}>
              {quote.voucher.ok ? t("voucherApplied") : t(`voucherReason.${quote.voucher.reason}`, { min: peso(quote.voucher.min_order ?? 0) })}
            </p>
          )}
          {canManualDiscount && <>
            <label><span className="label">{t("manualDiscount")}</span>
              <input className="input" type="number" min="0" step="0.01" value={manualAmt} onChange={(e) => setManualAmt(e.target.value)} placeholder="0.00" /></label>
            <label><span className="label">{t("manualDiscountReason")}{Number(manualAmt) > 0 ? " *" : ""}</span>
              <input className="input" value={manualReason} onChange={(e) => setManualReason(e.target.value)} /></label>
            {Number(manualAmt) > 0 && <p className="text-xs text-brown/60 sm:col-span-2">{t("manualDiscountFlag")}</p>}
          </>}
          <label className="sm:col-span-2"><span className="label">{t("notesCustomer")}</span>
            <textarea className="input py-3" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <label className="sm:col-span-2"><span className="label">{t("internalNotes")}</span>
            <textarea className="input py-3" rows={2} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} /></label>
          {mode === "edit" ? (
            <label className="sm:col-span-2"><span className="label">{t("changeNote")}</span>
              <input className="input" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder={t("changeNoteHint")} /></label>
          ) : (
            <label className="flex items-center gap-2 font-semibold sm:col-span-2">
              <input type="checkbox" className="h-5 w-5" checked={confirmNow} onChange={(e) => setConfirmNow(e.target.checked)} /> {t("confirmNow")}
            </label>
          )}
        </section>
      </div>

      {/* summary */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="card">
          <h2 className="mb-3 text-lg font-bold">{t("summary")}</h2>
          {opts?.customer.status && opts.customer.status !== "approved" && <p className="mb-2 rounded-lg bg-st-problem/10 p-2 text-sm text-st-problem">{t("errors.customer_not_approved")}</p>}
          {!hasItems && <p className="text-sm text-brown/60">{t("addProducts")}</p>}
          {hasItems && (
            <ul className="mb-3 grid gap-1 text-sm">
              {(quote?.lines ?? input.items.map((i) => ({ product_id: i.product_id, product_name: products.find((p) => p.id === i.product_id)?.name ?? "", qty: i.qty, is_free: false, free_reason: null, unit: "" }))).map((l, k) => (
                <li key={k} className="flex justify-between gap-2"><span>{l.product_name}{l.is_free && <b className="ml-1 text-st-ok">({tb("freeItem")})</b>}</span><span>× {fmtQty(l.qty)}</span></li>
              ))}
            </ul>
          )}
          {quote && !quote.hidden && quote.total !== undefined && hasItems && (
            <OrderBreakdownClient discounts={quote.discounts ?? []} totals={{ subtotal: quote.subtotal ?? 0, delivery_fee: quote.delivery_fee ?? 0, vatable_sales: quote.vatable_sales ?? 0,
              vat_exempt_sales: quote.vat_exempt_sales ?? 0, vat_amount: quote.vat_amount ?? 0, total: quote.total ?? 0, prices_include_vat: quote.settings?.prices_include_vat }} />
          )}
          <button type="button" className="btn-primary mt-4 w-full" disabled={pending || !customerId || !hasItems} onClick={submit}>
            {pending ? "…" : mode === "edit" ? tc("save") : t("placeOrder")}
          </button>
        </div>
      </aside>
    </div>
  );
}
