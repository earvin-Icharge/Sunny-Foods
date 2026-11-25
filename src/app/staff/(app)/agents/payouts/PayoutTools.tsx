"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { PhotoInput } from "@/components/ui/PhotoInput";
import { useAction } from "@/components/ui/useAction";
import { approveAllPayouts, approvePayout, cancelPayout, payPayout, runPayouts } from "../actions";

function defaultPeriod() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const y = now.getFullYear(); const m = now.getMonth(); const d = now.getDate();
  const iso = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  if (d > 15) return [iso(new Date(y, m, 1)), iso(new Date(y, m, 15))];
  return [iso(new Date(y, m - 1, 16)), iso(new Date(y, m, 0))];
}

export function PayoutRunForm() {
  const t = useTranslations("agents");
  const { run, pending } = useAction();
  const [p0, p1] = defaultPeriod();
  const [from, setFrom] = useState(p0);
  const [to, setTo] = useState(p1);
  return (
    <div className="card flex flex-wrap items-end gap-3">
      <div className="w-full font-bold">{t("newPayoutRun")}</div>
      <Field label={t("from")}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label={t("until")}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <button className="btn-primary" disabled={pending} onClick={() => run(() => runPayouts(from, to), { success: t("payoutsCreated") })}>{t("runPayouts")}</button>
    </div>
  );
}

export function ApproveAll({ ids }: { ids: string[] }) {
  const t = useTranslations("agents");
  const { run, pending } = useAction();
  return <button className="btn-primary btn-sm ml-auto" disabled={pending} onClick={() => run(() => approveAllPayouts(ids))}>{t("approveAll", { n: ids.length })}</button>;
}

export function PayoutRowActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations("agents");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [paying, setPaying] = useState(false);
  if (status === "draft") return (
    <div className="flex gap-2">
      <button className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => approvePayout(id))}>{t("approve")}</button>
      <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => cancelPayout(id))}>{tc("cancel")}</button>
    </div>
  );
  if (status !== "approved") return null;
  if (!paying) return (
    <div className="flex gap-2">
      <button className="btn-primary btn-sm" onClick={() => setPaying(true)}>{t("markPaid")}</button>
      <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => cancelPayout(id))}>{tc("cancel")}</button>
    </div>
  );
  return (
    <form className="grid w-full gap-3 rounded-xl bg-cream-light p-3 sm:grid-cols-3" action={(fd) => run(() => payPayout(id, fd), { onDone: () => setPaying(false) })}>
      <Field label={t("paidOn")}><Input name="paid_at" type="date" required defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })} /></Field>
      <Field label={t("payoutMethod")}><Select name="method" defaultValue="gcash"><option value="gcash">GCash</option><option value="bank">{t("bank")}</option><option value="cash">{t("cash")}</option></Select></Field>
      <Field label={t("reference")}><Input name="reference" required /></Field>
      <div className="sm:col-span-3"><PhotoInput name="proof" label={t("proof")} /></div>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <button type="button" className="btn-ghost" onClick={() => setPaying(false)}>{tc("cancel")}</button>
        <button className="btn-primary" disabled={pending}>{t("markPaid")}</button>
      </div>
    </form>
  );
}
