"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { PhotoInput } from "@/components/ui/PhotoInput";
import { todayManila } from "@/lib/format";
import { recordPayment } from "./actions";

const METHODS = ["cash", "cod", "bank_transfer", "gcash", "maya", "cheque", "salary_deduction"];

/** Record a payment against an order (date, amount, method, proof photo). */
export function RecordPaymentForm({ orderId, balance, compact }: { orderId: string; balance: number | null; compact?: boolean }) {
  const t = useTranslations("payments");
  const tb = useTranslations("orderBreakdown");
  const { run, pending } = useAction();
  const [open, setOpen] = useState(!compact);
  const [key, setKey] = useState(0);
  if (!open) return <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>+ {t("recordPayment")}</button>;
  return (
    <form key={key} className="grid gap-3 sm:grid-cols-2" action={(fd) => run(() => recordPayment(orderId, fd), {
      success: t("paymentRecorded"), onDone: () => { setKey((k) => k + 1); if (compact) setOpen(false); },
    })}>
      <label><span className="label">{t("amount")}</span>
        <input className="input" name="amount" type="number" step="0.01" min="0.01" required defaultValue={balance && balance > 0 ? balance.toFixed(2) : ""} /></label>
      <label><span className="label">{t("method")}</span>
        <select className="input" name="method" defaultValue="cash">{METHODS.map((m) => <option key={m} value={m}>{tb(m)}</option>)}</select></label>
      <label><span className="label">{t("paidOn")}</span>
        <input className="input" name="paid_at" type="date" defaultValue={todayManila()} /></label>
      <label><span className="label">{t("reference")}</span>
        <input className="input" name="reference" placeholder={t("referenceHint")} /></label>
      <div className="sm:col-span-2"><PhotoInput name="proof" label={t("proofOptional")} accept="image/*,application/pdf" /></div>
      <label className="sm:col-span-2"><span className="label">{t("notes")}</span><input className="input" name="notes" /></label>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "…" : t("savePayment")}</button>
        {compact && <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t("cancel")}</button>}
      </div>
    </form>
  );
}
