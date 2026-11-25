"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { addBlockedDate, removeBlockedDate, saveGeneralSettings } from "../actions";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function GeneralForm({ s, canEdit }: { s: Record<string, unknown>; canEdit: boolean }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const fees = (s.delivery_fees ?? {}) as Record<string, number>;
  const company = (s.company ?? {}) as Record<string, string>;
  const noDays = (s.no_delivery_weekdays ?? []) as number[];
  const windows = (s.time_windows ?? []) as string[];
  const n = (k: string) => (s[k] === null || s[k] === undefined ? "" : String(s[k]));
  return (
    <form className="grid gap-4" action={(fd) => run(() => saveGeneralSettings(fd))}>
      <fieldset disabled={!canEdit} className="grid gap-4">
        <section className="card grid gap-4 sm:grid-cols-2">
          <h2 className="text-lg font-bold sm:col-span-2">{t("vatTitle")}</h2>
          <p className="text-sm text-brown/70 sm:col-span-2">{t("vatHelp")}</p>
          <Field label={t("vatRate")}><Input name="vat_rate" type="number" step="0.01" min="0" defaultValue={String(Number(s.vat_rate ?? 0.12) * 100)} /></Field>
          <div className="grid gap-2 self-end">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="prices_include_vat" className="h-5 w-5" defaultChecked={s.prices_include_vat !== false} /> {t("pricesIncludeVat")}</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="discount_before_vat" className="h-5 w-5" defaultChecked={s.discount_before_vat !== false} /> {t("discountBeforeVat")}</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="delivery_fee_vatable" className="h-5 w-5" defaultChecked={s.delivery_fee_vatable !== false} /> {t("deliveryFeeVatable")}</label>
          </div>
        </section>
        <section className="card grid gap-4 sm:grid-cols-3">
          <h2 className="text-lg font-bold sm:col-span-3">{t("deliveryTitle")}</h2>
          <Field label={t("feeOwnTruck")}><Input name="fee_own_truck" type="number" min="0" step="0.01" defaultValue={String(fees.own_truck ?? 0)} /></Field>
          <Field label={t("feeCourier")}><Input name="fee_courier" type="number" min="0" step="0.01" defaultValue={String(fees.courier ?? 0)} /></Field>
          <Field label={t("feePickup")}><Input name="fee_pickup" type="number" min="0" step="0.01" defaultValue={String(fees.pickup ?? 0)} /></Field>
          <Field label={t("freeDeliveryOver")} hint={t("freeDeliveryHint")}><Input name="free_delivery_over" type="number" min="0" step="0.01" defaultValue={n("free_delivery_over")} /></Field>
          <Field label={t("minOrder")}><Input name="min_order_amount" type="number" min="0" step="0.01" defaultValue={n("min_order_amount")} /></Field>
          <Field label={t("timeWindows")} hint={t("timeWindowsHint")}><Textarea name="time_windows" defaultValue={windows.join("\n")} /></Field>
          <div className="sm:col-span-3">
            <span className="label">{t("noDeliveryDays")}</span>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((d) => (
                <label key={d} className="flex items-center gap-2 rounded-xl bg-cream-light px-3 py-2 font-semibold">
                  <input type="checkbox" name="no_delivery_weekdays" value={d} defaultChecked={noDays.includes(d)} className="h-5 w-5" /> {t(`weekday_${d}`)}
                </label>
              ))}
            </div>
          </div>
          <Field label={t("pickupAddress")} className="sm:col-span-3"><Input name="pickup_address" defaultValue={n("pickup_address")} /></Field>
        </section>
        <section className="card grid gap-4 sm:grid-cols-2">
          <h2 className="text-lg font-bold sm:col-span-2">{t("companyTitle")}</h2>
          <Field label={t("companyName")}><Input name="company_name" defaultValue={company.name ?? ""} /></Field>
          <Field label={t("companyTin")}><Input name="company_tin" defaultValue={company.tin ?? ""} /></Field>
          <Field label={t("companyAddress")} className="sm:col-span-2"><Input name="company_address" defaultValue={company.address ?? ""} /></Field>
          <Field label={tc("phone")}><Input name="company_phone" defaultValue={company.phone ?? ""} /></Field>
          <Field label={tc("email")}><Input name="company_email" defaultValue={company.email ?? ""} /></Field>
          <Field label={t("receiptFooter")} hint={t("receiptFooterHint")} className="sm:col-span-2"><Input name="receipt_footer" defaultValue={n("receipt_footer")} /></Field>
        </section>
        <section className="card grid gap-4 sm:grid-cols-3">
          <h2 className="text-lg font-bold sm:col-span-3">{t("otherTitle")}</h2>
          <Field label={t("expiryAlertDays")}><Input name="expiry_alert_days" type="number" min="1" defaultValue={n("expiry_alert_days")} /></Field>
          <Field label={t("agentReadonlyDays")}><Input name="agent_portal_readonly_days" type="number" min="0" defaultValue={n("agent_portal_readonly_days")} /></Field>
          <Field label={t("voucherAttemptLimit")}><Input name="voucher_attempt_limit" type="number" min="1" defaultValue={n("voucher_attempt_limit")} /></Field>
        </section>
      </fieldset>
      {canEdit && <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{tc("save")}</button></div>}
    </form>
  );
}

export function BlockedDates({ rows, canEdit }: { rows: { id: string; label: string; reason: string }[]; canEdit: boolean }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  return (
    <section className="card mt-4">
      <h2 className="text-lg font-bold">{t("blockedDates")}</h2>
      <p className="mb-3 text-sm text-brown/70">{t("blockedDatesHelp")}</p>
      <ul className="grid gap-1">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-xl bg-cream-light px-3 py-2">
            <span><b>{r.label}</b> {r.reason && `· ${r.reason}`}</span>
            {canEdit && <button className="btn-ghost btn-sm text-st-problem" disabled={pending} onClick={() => run(() => removeBlockedDate(r.id))}>{tc("remove")}</button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="input w-44" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          <input className="input flex-1" placeholder={t("blockedReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-secondary" disabled={!day || pending} onClick={() => run(() => addBlockedDate(day, reason), { onDone: () => { setDay(""); setReason(""); } })}>+ {tc("add")}</button>
        </div>
      )}
    </section>
  );
}
