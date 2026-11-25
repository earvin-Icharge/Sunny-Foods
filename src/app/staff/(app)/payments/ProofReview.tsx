"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { peso } from "@/lib/format";
import { reviewProof } from "./actions";

type Proof = { id: string; customer: string; orderId: string | null; orderNo: string | null; amount: number; method: string; reference: string | null; url: string | null; uploaded: string; isPdf: boolean };

/** Staff checks a bank/GCash/Maya screenshot, then approves (payment recorded) or rejects. */
export function ProofReview({ proof, orders }: { proof: Proof; orders: { id: string; label: string }[] }) {
  const t = useTranslations("payments");
  const tb = useTranslations("orderBreakdown");
  const { run, pending } = useAction();
  const [orderId, setOrderId] = useState(proof.orderId ?? (orders.length === 1 ? orders[0].id : ""));
  const [note, setNote] = useState("");
  return (
    <div className="card grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-bold">{proof.customer}</div>
          <div className="text-sm text-brown/70">{tb(proof.method)}{proof.reference ? ` · ${t("ref")} ${proof.reference}` : ""} · {proof.uploaded}</div>
        </div>
        <div className="text-xl font-bold">{peso(proof.amount)}</div>
      </div>
      {proof.url && (proof.isPdf
        ? <a className="btn-secondary" href={proof.url} target="_blank" rel="noreferrer">📄 {t("openFile")}</a>
        : <a href={proof.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proof.url} alt="" className="max-h-72 w-full rounded-xl bg-cream object-contain" />
          </a>)}
      <label><span className="label">{t("forOrder")}</span>
        <select className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          <option value="">{t("chooseOrder")}</option>
          {proof.orderId && !orders.some((o) => o.id === proof.orderId) && <option value={proof.orderId}>{proof.orderNo}</option>}
          {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select></label>
      <label><span className="label">{t("note")}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("noteHint")} /></label>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary text-st-problem" disabled={pending} onClick={() => run(() => reviewProof(proof.id, false, null, note), { success: t("rejected") })}>{t("reject")}</button>
        <button className="btn-primary" disabled={pending || !orderId} onClick={() => run(() => reviewProof(proof.id, true, orderId, note || null), { success: t("verified") })}>✓ {t("approve")}</button>
      </div>
    </div>
  );
}
