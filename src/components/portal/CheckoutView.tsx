"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, postJson } from "@/lib/portal-client";
import { peso } from "@/lib/format";
import { OrderBreakdownClient } from "@/components/orders/OrderBreakdownClient";
import type { Discount } from "@/components/orders/OrderBreakdown";
import { useToast } from "@/components/ui/Toast";
import { ProductPhoto, useName, type CatalogItem } from "./shared";
import { QtyStepper } from "./CatalogView";

type Options = {
  customer: { id: string; name: string; status: string; payment_terms: string; allowed_payment_methods: string[];
    default_delivery_method: string; is_employee_account: boolean; address: string | null };
  addresses: { id: string; label: string; is_default: boolean; address: string | null }[];
  settings: { min_order_amount: number; delivery_fees: Record<string, number>; free_delivery_over: number | null;
    no_delivery_weekdays: number[]; time_windows: string[]; pickup_address: string | null; prices_include_vat: boolean;
    today: string; blocked_dates: string[] };
  vouchers: { id: string; name: string; code: string; type: string; value: number; value_kind: string; min_order: number; end_at: string | null }[];
  employee_allowance: { product_id: string | null; monthly_amount: number | null; monthly_packs: number | null; spent: number; packs_used: number }[] | null;
};
type Quote = {
  ok: boolean; subtotal: number; delivery_fee: number; vatable_sales: number; vat_exempt_sales: number; vat_amount: number; total: number;
  items_total: number; discounts: Discount[]; errors: { code: string }[];
  voucher: { ok: boolean; reason: string | null; code: string; label: string; min_order?: number; buy_qty?: number } | null;
  lines: { product_id: string; qty: number; unit_price: number; line_total: number; is_free: boolean; price_source: string; free_reason: string | null }[];
};

const ALL_METHODS = ["cash", "cod", "bank_transfer", "gcash", "maya", "cheque"];

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/**
 * Cart + checkout (Spec 7.10): delivery method, allowed dates, time window, address,
 * allowed payment options, voucher box, employee limit, notes, full price breakdown
 * from the database, then Place Order. Used by the customer portal and agent mode.
 */
export function CheckoutView({ mode, customerId, catalogHref, ordersHref, allowVoucher = true }: {
  mode: "portal" | "agent"; customerId?: string; catalogHref: string; ordersHref: string; allowVoucher?: boolean;
}) {
  const t = useTranslations("checkout");
  const tb = useTranslations("orderBreakdown");
  const name = useName();
  const router = useRouter();
  const toast = useToast();
  const qs = customerId ? `?customer_id=${customerId}` : "";
  const [catalog, setCatalog] = useState<Record<string, CatalogItem>>({});
  const [cart, setCart] = useState<{ product_id: string; qty: number }[] | null>(null);
  const [opt, setOpt] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [method, setMethod] = useState("own_truck");
  const [date, setDate] = useState("");
  const [windowSel, setWindowSel] = useState("");
  const [addressId, setAddressId] = useState<string>("");
  const [newAddress, setNewAddress] = useState("");
  const [payment, setPayment] = useState("");
  const [notes, setNotes] = useState("");
  const [voucherInput, setVoucherInput] = useState("");
  const [voucher, setVoucher] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [placing, setPlacing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const quoteSeq = useRef(0);

  useEffect(() => {
    let live = true;
    (async () => {
      const [c, k, o] = await Promise.all([
        api<{ items: CatalogItem[] }>(`/api/portal/catalog${qs}`),
        api<{ items: { product_id: string; qty: number }[] }>(`/api/portal/cart${qs}`),
        api<Options>(`/api/portal/checkout-options${qs}`),
      ]);
      if (!live) return;
      if (!c.ok || !k.ok || !o.ok) { setLoadError(!o.ok ? o.error : !c.ok ? c.error : (k as { error: string }).error); return; }
      setCatalog(Object.fromEntries(c.data.items.map((i) => [i.id, i])));
      setCart(k.data.items);
      setOpt(o.data);
      setMethod(o.data.customer.default_delivery_method || "own_truck");
      setAddressId(o.data.addresses.find((a) => a.is_default)?.id ?? o.data.addresses[0]?.id ?? "");
      setWindowSel(o.data.settings.time_windows[0] ?? "");
    })();
    return () => { live = false; };
  }, [qs]);

  const payOptions = useMemo(() => {
    if (!opt) return [];
    const list = ALL_METHODS.filter((m) => opt.customer.allowed_payment_methods?.includes(m));
    if (opt.customer.payment_terms?.startsWith("credit_")) list.push(opt.customer.payment_terms);
    if (opt.customer.is_employee_account) list.push("salary_deduction");
    return list;
  }, [opt]);
  const paySel = payment || payOptions[0] || "";

  const runQuote = useCallback(async (code: string | null, record: boolean) => {
    if (!cart) return null;
    const seq = ++quoteSeq.current;
    const r = await postJson<Quote>("/api/portal/quote", {
      customer_id: customerId, items: cart, delivery_method: method, voucher_code: code, record_attempt: record,
    });
    if (seq !== quoteSeq.current) return null;
    if (r.ok) setQuote(r.data);
    return r.ok ? r.data : null;
  }, [cart, customerId, method]);

  useEffect(() => {
    const id = setTimeout(() => { runQuote(voucher, false); }, 250);
    return () => clearTimeout(id);
  }, [runQuote, voucher]);

  async function setLine(productId: string, qty: number) {
    setCart((c) => (c ?? []).map((l) => (l.product_id === productId ? { ...l, qty } : l)).filter((l) => l.qty > 0));
    await postJson("/api/portal/cart", { customer_id: customerId, product_id: productId, qty, mode: "set" });
  }

  async function applyVoucher(code: string) {
    const c = code.trim();
    if (!c) return;
    const q = await runQuote(c, true);
    if (q?.voucher?.ok) { setVoucher(c); setVoucherInput(c); toast.show(t("voucherApplied")); }
    else setVoucher(null);
  }

  function dateProblem(d: string): string | null {
    if (!opt || !d) return null;
    if (d < opt.settings.today) return t("errors.date_in_past");
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    if (opt.settings.no_delivery_weekdays.includes(dow) || opt.settings.blocked_dates.includes(d)) return t("errors.date_blocked");
    return null;
  }

  function errorText(code: string, q?: Quote | null): string {
    if (code.startsWith("voucher_")) return voucherText(code.slice(8), q?.voucher ?? null);
    const key = `errors.${code}`;
    return t.has(key) ? t(key, { amount: peso(opt?.settings.min_order_amount ?? 0) }) : t("errors.generic");
  }
  function voucherText(reason: string, v: Quote["voucher"]): string {
    const key = `voucherReasons.${reason}`;
    return t.has(key) ? t(key, { amount: peso(v?.min_order ?? 0), qty: String(v?.buy_qty ?? "") }) : t("voucherReasons.invalid");
  }

  async function place() {
    if (!opt || !cart?.length) return;
    const problems: string[] = [];
    if (method !== "pickup" && !date) problems.push(t("errors.delivery_date_required"));
    const dp = dateProblem(date); if (dp) problems.push(dp);
    if (method !== "pickup" && !addressId && !newAddress.trim() && !opt.customer.address) problems.push(t("errors.address_required"));
    if (!paySel) problems.push(t("errors.payment_method_required"));
    setErrors(problems);
    if (problems.length) return;
    setPlacing(true);
    const r = await postJson<{ ok: boolean; order_id?: string; order_no?: string; errors?: { code: string }[] }>("/api/portal/orders", {
      customer_id: customerId, delivery_method: method, delivery_date: date || null, time_window: method === "pickup" ? null : windowSel,
      address_id: newAddress.trim() ? null : addressId || null, delivery_address: newAddress.trim() || null,
      payment_method: paySel, voucher_code: voucher, notes,
    });
    setPlacing(false);
    if (!r.ok) { setErrors([r.error === "offline" ? t("errors.offline") : r.error]); return; }
    if (!r.data.ok) { setErrors((r.data.errors ?? []).map((e) => errorText(e.code, quote))); return; }
    router.push(`${ordersHref}/${r.data.order_id}?placed=1`);
    router.refresh();
  }

  if (loadError) return <p className="card text-st-problem">{loadError === "offline" ? t("errors.offline") : loadError}</p>;
  if (!opt || !cart) return <p className="py-10 text-center text-brown/60">{t("loading")}</p>;
  if (cart.length === 0) return (
    <div className="card py-10 text-center">
      <p className="text-lg font-semibold">{t("emptyCart")}</p>
      <Link href={catalogHref} className="btn-primary mt-4">{t("goShopping")}</Link>
    </div>
  );

  const approved = opt.customer.status === "approved";
  const fees = opt.settings.delivery_fees ?? {};
  const minOrder = Number(opt.settings.min_order_amount ?? 0);
  const belowMin = quote ? quote.items_total < minOrder : false;
  const allowance = opt.employee_allowance?.find((a) => a.product_id === null && a.monthly_amount !== null);
  const priceOf = (pid: string) => quote?.lines.find((l) => l.product_id === pid && !l.is_free);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="grid gap-5">
        {mode === "agent" && <div className="rounded-xl bg-cream p-3 font-semibold">{t("orderingFor", { name: opt.customer.name })}</div>}
        {!approved && <div className="rounded-xl bg-gold/20 p-4 font-semibold">⏳ {t("errors.customer_not_approved")}</div>}

        <section className="card">
          <h2 className="mb-3 text-lg font-bold">{t("cart")}</h2>
          <ul className="grid gap-3">
            {cart.map((l) => {
              const p = catalog[l.product_id];
              const q = priceOf(l.product_id);
              return (
                <li key={l.product_id} className="flex items-center gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl"><ProductPhoto url={p?.photo_url} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-tight">{p ? name(p) : "…"}</div>
                    <div className="text-sm text-brown/60">
                      {q ? <>{peso(q.unit_price)} · {q.price_source === "employee" ? <b className="text-st-ok">{t("employeeRate")}</b> : null} {peso(q.line_total)}</> : null}
                    </div>
                  </div>
                  <QtyStepper value={l.qty} min={0} onChange={(n) => setLine(l.product_id, n)} />
                </li>
              );
            })}
            {quote?.lines.filter((l) => l.is_free).map((l, i) => (
              <li key={"free" + i} className="flex items-center gap-3 rounded-xl bg-st-ok/10 p-2 text-sm">
                🎁 <b>{catalog[l.product_id] ? name(catalog[l.product_id]) : ""}</b> × {l.qty} — {tb("freeItem")} ({l.free_reason})
              </li>
            ))}
          </ul>
          <Link href={catalogHref} className="mt-3 inline-block text-sm font-semibold text-sunny">+ {t("addMore")}</Link>
        </section>

        <section className="card grid gap-4">
          <h2 className="text-lg font-bold">{t("delivery")}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["own_truck", "courier", "pickup"] as const).map((m) => (
              <label key={m} className={`flex min-h-14 cursor-pointer flex-col justify-center rounded-xl p-3 ring-1 ${method === m ? "bg-sunny/5 ring-2 ring-sunny" : "ring-brown/15"}`}>
                <input type="radio" name="method" className="sr-only" checked={method === m} onChange={() => setMethod(m)} />
                <span className="font-semibold">{tb(m)}</span>
                <span className="text-xs text-brown/60">{Number(fees[m] ?? 0) > 0 ? peso(fees[m]) : t("noFee")}</span>
              </label>
            ))}
          </div>
          {method === "pickup" && opt.settings.pickup_address && <p className="text-sm text-brown/70">📍 {String(opt.settings.pickup_address)}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">{method === "pickup" ? t("pickupDate") : t("deliveryDate")}</span>
              <input type="date" className="input" min={addDays(opt.settings.today, 1)} value={date} onChange={(e) => setDate(e.target.value)} />
              {dateProblem(date) && <span className="mt-1 block text-sm text-st-problem">{dateProblem(date)}</span>}
              <span className="mt-1 block text-xs text-brown/60">{t("noDeliveryDays")}</span>
            </label>
            {method !== "pickup" && (
              <label><span className="label">{t("timeWindow")}</span>
                <select className="input" value={windowSel} onChange={(e) => setWindowSel(e.target.value)}>
                  {opt.settings.time_windows.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </label>
            )}
          </div>
          {method !== "pickup" && (
            <div className="grid gap-2">
              <span className="label">{t("deliveryAddress")}</span>
              {opt.addresses.map((a) => (
                <label key={a.id} className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ${addressId === a.id && !newAddress ? "ring-2 ring-sunny" : "ring-brown/15"}`}>
                  <input type="radio" name="addr" className="mt-1" checked={addressId === a.id && !newAddress} onChange={() => { setAddressId(a.id); setNewAddress(""); }} />
                  <span><b>{a.label}</b>{a.address ? <span className="block text-sm text-brown/70">{a.address}</span> : null}</span>
                </label>
              ))}
              {mode === "portal" && (
                <input className="input" placeholder={t("otherAddress")} value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
              )}
            </div>
          )}
        </section>

        <section className="card grid gap-3">
          <h2 className="text-lg font-bold">{t("payment")}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {payOptions.map((m) => (
              <label key={m} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 ring-1 ${paySel === m ? "ring-2 ring-sunny" : "ring-brown/15"}`}>
                <input type="radio" name="pay" checked={paySel === m} onChange={() => setPayment(m)} /> <span className="font-semibold">{tb(m)}</span>
              </label>
            ))}
          </div>
          {(paySel === "bank_transfer" || paySel === "gcash" || paySel === "maya") && <p className="text-sm text-brown/70">{t("proofHint")}</p>}
          {allowance && (
            <p className="rounded-xl bg-st-ok/10 p-3 text-sm">
              {t("employeeLimit", { left: peso(Math.max(Number(allowance.monthly_amount) - Number(allowance.spent), 0)), limit: peso(allowance.monthly_amount) })}
            </p>
          )}
        </section>

        {allowVoucher && (
          <section className="card grid gap-3">
            <h2 className="text-lg font-bold">{t("voucher")}</h2>
            <div className="flex gap-2">
              <input className="input font-mono uppercase" placeholder={t("voucherCode")} value={voucherInput} onChange={(e) => setVoucherInput(e.target.value)} />
              {voucher ? (
                <button className="btn-secondary" onClick={() => { setVoucher(null); setVoucherInput(""); }}>{t("removeVoucher")}</button>
              ) : (
                <button className="btn-secondary" disabled={!voucherInput.trim()} onClick={() => applyVoucher(voucherInput)}>{t("apply")}</button>
              )}
            </div>
            {quote?.voucher && (
              quote.voucher.ok
                ? <p className="text-sm font-semibold text-st-ok">✓ {quote.voucher.label}</p>
                : <p className="text-sm font-semibold text-st-problem">✗ {voucherText(quote.voucher.reason ?? "invalid", quote.voucher)}</p>
            )}
            {opt.vouchers.length > 0 && (
              <div>
                <span className="label">{t("myVouchers")}</span>
                <div className="flex flex-wrap gap-2">
                  {opt.vouchers.map((v) => (
                    <button key={v.id} className="rounded-xl bg-gold/20 px-3 py-2 text-left text-sm" onClick={() => { setVoucherInput(v.code); applyVoucher(v.code); }}>
                      <b className="font-mono">{v.code}</b> · {v.name}{v.min_order > 0 ? ` · ${t("minSpend", { amount: peso(v.min_order) })}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="card">
          <label><span className="label">{t("notes")}</span>
            <textarea className="input py-3" rows={3} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder={t("notesPlaceholder")} /></label>
        </section>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <section className="card grid gap-3">
          <h2 className="text-lg font-bold">{t("summary")}</h2>
          {quote ? (
            <OrderBreakdownClient discounts={quote.discounts} totals={{ subtotal: quote.subtotal, delivery_fee: quote.delivery_fee,
              vatable_sales: quote.vatable_sales, vat_exempt_sales: quote.vat_exempt_sales, vat_amount: quote.vat_amount, total: quote.total,
              prices_include_vat: opt.settings.prices_include_vat }} />
          ) : <p className="text-brown/60">{t("loading")}</p>}
          {belowMin && <p className="rounded-lg bg-st-problem/10 p-2 text-sm text-st-problem">{t("errors.min_order", { amount: peso(minOrder) })}</p>}
          {errors.length > 0 && <ul className="grid gap-1 rounded-lg bg-st-problem/10 p-3 text-sm text-st-problem">{errors.map((e, i) => <li key={i}>• {e}</li>)}</ul>}
          <button className="btn-primary w-full text-lg" disabled={placing || !approved || belowMin || !quote} onClick={place}>
            {placing ? "…" : t("placeOrder")}
          </button>
          <p className="text-xs text-brown/60">{t("confirmNote")}</p>
        </section>
      </aside>
    </div>
  );
}
