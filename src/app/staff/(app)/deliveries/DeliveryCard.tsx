"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PhotoInput } from "@/components/ui/PhotoInput";
import { useAction } from "@/components/ui/useAction";
import { peso } from "@/lib/format";
import { AssignDriverForm } from "../orders/[id]/OrderActions";
import { dispatchOrder, markDelivered } from "./actions";

export type DeliveryRow = {
  id: string; orderNo: string; customer: string; contact: string | null; phone: string | null; address: string | null; lat: number | null; lng: number | null;
  status: string; method: string; courier: string | null; date: string; timeWindow: string | null; payment: string; paymentStatus: string;
  balance: number | null; driverId: string | null; driverName: string | null; notes: string | null; scheduled: string; items: string[]; focus: boolean;
};

export function DeliveryCard({ d, isDriver, canAct, canOpenOrder, drivers }: { d: DeliveryRow; isDriver: boolean; canAct: boolean; canOpenOrder: boolean; drivers: { id: string; name: string }[] }) {
  const t = useTranslations("deliveries");
  const tb = useTranslations("orderBreakdown");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [open, setOpen] = useState(d.focus);
  const pickup = d.method === "pickup";
  const mapUrl = d.lat !== null && d.lng !== null ? `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`
    : d.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d.address)}` : null;
  const collectCash = ["cash", "cod"].includes(d.payment) && d.paymentStatus !== "paid";
  const canDeliver = canAct && (d.status === "out_for_delivery" || (pickup && d.status === "packed"));
  return (
    <div className={`card grid gap-3 ${d.focus ? "ring-2 ring-sunny" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-bold">{d.timeWindow ? `🕘 ${d.timeWindow}` : d.date}</div>
          <div className="font-semibold">{d.customer}</div>
          <div className="text-xs text-brown/60">{canOpenOrder ? <Link className="text-sunny" href={`/staff/orders/${d.id}`}>{d.orderNo}</Link> : d.orderNo} · {tb(d.method)}{d.courier ? ` (${d.courier})` : ""}</div>
        </div>
        <StatusBadge status={d.status} />
      </div>
      {!pickup && d.address && <p className="text-sm">📍 {d.address}</p>}
      {d.contact && <p className="text-sm">👤 {d.contact}</p>}
      <div className="grid grid-cols-2 gap-2">
        {d.phone ? <a className="btn-secondary" href={`tel:${d.phone}`}>📞 {t("call")}</a> : <span />}
        {!pickup && mapUrl ? <a className="btn-secondary" href={mapUrl} target="_blank" rel="noreferrer">🗺️ {t("map")}</a> : <span />}
      </div>
      <ul className="text-sm text-brown/80">{d.items.map((i, k) => <li key={k}>• {i}</li>)}</ul>
      {d.notes && <p className="rounded-lg bg-cream-light p-2 text-sm">📝 {d.notes}</p>}
      <p className="text-sm">{tb(d.payment)}{collectCash && d.balance !== null ? <> · <b className="text-st-problem">{t("collect")} {peso(d.balance)}</b></> : null}</p>
      {!isDriver && <p className="text-sm text-brown/70">🚚 {d.driverName ?? t("noDriver")}</p>}

      {!isDriver && canAct && !pickup && ["confirmed", "packing", "packed", "out_for_delivery"].includes(d.status) && drivers.length > 0 && (
        <AssignDriverForm orderId={d.id} drivers={drivers} current={d.driverId} date={d.scheduled} />
      )}
      {!isDriver && canAct && d.status === "packed" && !pickup && (
        <button className="btn-primary" disabled={pending || !d.driverId} onClick={() => run(() => dispatchOrder(d.id), { success: t("dispatched") })}>
          🚚 {d.driverId ? t("dispatch") : t("assignFirst")}
        </button>
      )}
      {canDeliver && !open && (
        <button className="btn-primary" onClick={() => setOpen(true)}>{pickup ? `✓ ${t("markPickedUp")}` : `✓ ${t("markDelivered")}`}</button>
      )}
      {canDeliver && open && (
        <form className="grid gap-3 rounded-xl bg-cream-light p-3" action={(fd) => run(() => markDelivered(d.id, pickup, fd), { success: t("deliveredDone") })}>
          <PhotoInput name="proof" required={!pickup} label={pickup ? t("proofOptional") : t("proofRequired")} />
          <label><span className="label">{t("collected")}</span>
            <input className="input" name="collected" type="number" step="0.01" min="0" defaultValue={collectCash && d.balance ? d.balance.toFixed(2) : "0"} /></label>
          <label><span className="label">{t("notes")}</span><input className="input" name="notes" /></label>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={pending}>{pending ? "…" : t("confirmDelivered")}</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{tc("cancel")}</button>
          </div>
        </form>
      )}
    </div>
  );
}
