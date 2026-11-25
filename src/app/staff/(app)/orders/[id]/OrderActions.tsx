"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { assignDriver, saveBirInvoice, setOrderStatus } from "../actions";

/** Status buttons for one order (Spec 7.5 status flow). */
export function OrderActions({ orderId, status, method, canConfirm, canPack, canDispatch, canComplete, canCancel }: {
  orderId: string; status: string; method: string; canConfirm: boolean; canPack: boolean; canDispatch: boolean; canComplete: boolean; canCancel: boolean;
}) {
  const t = useTranslations("orders");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap gap-2">
      {status === "new" && canConfirm && (
        <button className="btn-primary" disabled={pending} onClick={() => run(() => setOrderStatus(orderId, "confirmed"), { success: t("confirmed"), undo: true })}>✓ {t("confirm")}</button>
      )}
      {(status === "confirmed" || status === "packing") && canPack && <Link className="btn-primary" href={`/staff/packing/${orderId}`}>📦 {status === "packing" ? t("continuePacking") : t("startPacking")}</Link>}
      {status === "packed" && method !== "pickup" && canDispatch && (
        <button className="btn-primary" disabled={pending} onClick={() => run(() => setOrderStatus(orderId, "out_for_delivery"), { success: t("dispatched") })}>🚚 {t("dispatch")}</button>
      )}
      {((status === "packed" && method === "pickup") || status === "out_for_delivery") && canDispatch && (
        <Link className="btn-primary" href={`/staff/deliveries?order=${orderId}`}>{method === "pickup" ? t("markPickedUp") : t("markDelivered")}</Link>
      )}
      {status === "delivered" && canComplete && (
        <button className="btn-secondary" disabled={pending} onClick={() => run(() => setOrderStatus(orderId, "completed"))}>{t("complete")}</button>
      )}
      {!["delivered", "completed", "cancelled"].includes(status) && canCancel && (
        <button className="btn-secondary text-st-problem" onClick={() => setCancelOpen(true)}>{t("cancelOrder")}</button>
      )}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setCancelOpen(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{t("cancelOrder")}</h3>
            <p className="mt-1 text-sm text-brown/70">{t("cancelHelp")}</p>
            <textarea className="input mt-3 py-3" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("cancelReason")} autoFocus />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setCancelOpen(false)}>{tc("back")}</button>
              <button className="btn-danger" disabled={!reason.trim() || pending}
                onClick={() => run(() => setOrderStatus(orderId, "cancelled", reason), { success: t("cancelled"), onDone: () => setCancelOpen(false) })}>{t("cancelOrder")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AssignDriverForm({ orderId, drivers, current, date }: { orderId: string; drivers: { id: string; name: string }[]; current: string | null; date: string }) {
  const t = useTranslations("orders");
  const { run, pending } = useAction();
  const [driver, setDriver] = useState(current ?? "");
  const [day, setDay] = useState(date);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-40 flex-1"><span className="label">{t("driver")}</span>
        <select className="input" value={driver} onChange={(e) => setDriver(e.target.value)}>
          <option value="">{t("chooseDriver")}</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select></label>
      <label><span className="label">{t("deliveryDate")}</span><input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
      <button className="btn-secondary" disabled={!driver || pending} onClick={() => run(() => assignDriver(orderId, driver, day), { success: t("driverAssigned") })}>{t("assign")}</button>
    </div>
  );
}

export function BirInvoiceField({ orderId, value }: { orderId: string; value: string }) {
  const t = useTranslations("orders");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [v, setV] = useState(value);
  return (
    <div className="flex items-end gap-2">
      <label className="flex-1"><span className="label">{t("birInvoiceNo")}</span><input className="input" value={v} onChange={(e) => setV(e.target.value)} /></label>
      <button className="btn-secondary" disabled={pending || v === value} onClick={() => run(() => saveBirInvoice(orderId, v), { undo: true })}>{tc("save")}</button>
    </div>
  );
}
