"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { api, postJson } from "@/lib/portal-client";
import { date, peso, qty } from "@/lib/format";
import { OrderBreakdownClient } from "@/components/orders/OrderBreakdownClient";
import type { Discount } from "@/components/orders/OrderBreakdown";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { ProductPhoto, StatusTracker, useName } from "./shared";

type Data = {
  order: Record<string, unknown> & { id: string; order_no: string; status: string; payment_status: string; delivery_method: string; total: number; paid_amount: number };
  items: { id: string; product_name: string; unit: string; qty: number; is_free: boolean; free_reason: string | null; unit_price: number; line_total: number; photo_url: string | null }[];
  discounts: Discount[]; payments: { amount: number; method: string; paid_at: string; reference: string | null }[]; prices_include_vat: boolean;
};

/** One order: tracker, items, price breakdown, payments, cancel / request change / reorder / receipt. */
export function OrderDetailView({ id, placed }: { id: string; placed?: boolean }) {
  const t = useTranslations("portal");
  const tb = useTranslations("orderBreakdown");
  const locale = useLocale();
  const name = useName();
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "cancel" | "change">("none");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/portal/orders/${id}`);
    if (r.ok) setD(r.data); else setErr(r.error);
  }, [id]);
  useEffect(() => { const t0 = setTimeout(load, 0); return () => clearTimeout(t0); }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    const r = await postJson<{ done: string }>(`/api/portal/orders/${id}`, { action, ...extra });
    setBusy(false);
    if (!r.ok) return toast.show(r.error, "error");
    setMode("none"); setText("");
    if (action === "reorder") { toast.show(t("reorderDone")); router.push("/portal/cart"); return; }
    toast.show(action === "cancel" ? t("cancelDone") : t("changeSent"));
    load();
  }

  if (err) return <p className="card text-st-problem">{err}</p>;
  if (!d) return <p className="py-10 text-center text-brown/60">{t("loading")}</p>;
  const o = d.order;
  return (
    <div className="grid gap-4">
      {placed && <div className="rounded-xl bg-st-ok/10 p-4 font-semibold text-st-ok">✓ {t("placedThanks", { no: o.order_no })}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{o.order_no}</h1>
        <div className="flex gap-1"><StatusBadge status={o.status} /><StatusBadge kind="payment" status={o.payment_status} /></div>
      </div>
      <section className="card"><StatusTracker status={o.status} pickup={o.delivery_method === "pickup"} /></section>
      {Boolean(o.changed_by_staff) && <p className="rounded-xl bg-gold/20 p-3 text-sm">{t("changedByStaff")}</p>}
      {o.status === "cancelled" && o.cancel_reason ? <p className="rounded-xl bg-st-problem/10 p-3 text-sm">{t("cancelReason")}: {String(o.cancel_reason)}</p> : null}

      <section className="card grid gap-1 text-sm sm:grid-cols-2">
        <div><span className="text-brown/60">{t("delivery")}:</span> <b>{tb(o.delivery_method)}</b>{o.courier_name ? ` (${String(o.courier_name)})` : ""}</div>
        <div><span className="text-brown/60">{tb("deliveryDate")}:</span> <b>{date(o.delivery_date as string, locale)}</b> {String(o.time_window ?? "")}</div>
        <div className="sm:col-span-2"><span className="text-brown/60">{tb("deliverTo")}:</span> {String(o.delivery_address ?? "—")}</div>
        <div><span className="text-brown/60">{tb("payment")}:</span> <b>{tb(String(o.payment_method))}</b></div>
        {o.due_date ? <div><span className="text-brown/60">{t("dueDate")}:</span> {date(o.due_date as string, locale)}</div> : null}
        {o.notes ? <div className="sm:col-span-2">📝 {String(o.notes)}</div> : null}
      </section>

      <section className="card">
        <ul className="grid gap-3">
          {d.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl"><ProductPhoto url={i.photo_url} /></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{name(i, "product_name") || i.product_name} {i.is_free && <span className="rounded bg-st-ok/15 px-1.5 text-xs text-st-ok">{tb("freeItem")}</span>}</div>
                <div className="text-sm text-brown/60">{qty(i.qty)} {i.unit} × {peso(i.unit_price)}</div>
              </div>
              <span className="font-semibold">{peso(i.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-brown/10 pt-3">
          <OrderBreakdownClient discounts={d.discounts} totals={{ subtotal: o.subtotal as number, delivery_fee: o.delivery_fee as number,
            vatable_sales: o.vatable_sales as number, vat_exempt_sales: o.vat_exempt_sales as number, vat_amount: o.vat_amount as number,
            total: o.total, paid_amount: o.paid_amount, prices_include_vat: d.prices_include_vat }} />
        </div>
      </section>

      {d.payments.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-bold">{t("payments")}</h2>
          <ul className="grid gap-1 text-sm">{d.payments.map((p, i) => <li key={i} className="flex justify-between"><span>{date(p.paid_at, locale)} · {tb(p.method === "adjustment" ? "cash" : p.method)}</span><b>{peso(p.amount)}</b></li>)}</ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Link className="btn-secondary" href={`/portal/orders/${id}/receipt`}>📄 {t("receipt")}</Link>
        <button className="btn-secondary" disabled={busy} onClick={() => act("reorder")}>🔁 {t("reorder")}</button>
        {o.payment_status !== "paid" && o.status !== "cancelled" && <Link className="btn-secondary" href={`/portal/account?pay=${id}#pay`}>💳 {t("uploadProof")}</Link>}
        {o.status === "new" && <button className="btn-secondary text-st-problem" onClick={() => setMode("cancel")}>{t("cancelOrder")}</button>}
        {!["new", "cancelled", "delivered", "completed"].includes(o.status) && <button className="btn-secondary" onClick={() => setMode("change")}>{t("requestChange")}</button>}
      </div>

      {mode !== "none" && (
        <section className="card grid gap-3">
          <h2 className="font-bold">{mode === "cancel" ? t("cancelOrder") : t("requestChange")}</h2>
          <textarea className="input py-3" rows={3} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={mode === "cancel" ? t("cancelReasonPlaceholder") : t("changePlaceholder")} />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setMode("none")}>{t("close")}</button>
            <button className={mode === "cancel" ? "btn-danger" : "btn-primary"} disabled={busy || (mode === "change" && !text.trim())}
              onClick={() => act(mode === "cancel" ? "cancel" : "request_change", mode === "cancel" ? { reason: text } : { message: text })}>
              {mode === "cancel" ? t("confirmCancel") : t("send")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
