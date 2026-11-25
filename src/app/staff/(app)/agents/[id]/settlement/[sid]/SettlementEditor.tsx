"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { PhotoInput } from "@/components/ui/PhotoInput";
import { useAction } from "@/components/ui/useAction";
import { peso } from "@/lib/format";
import { applySettlement, saveSettlement } from "../../../actions";

type D = { customer_id: string; action: string; to_agent_id: string | null; until: string | null };
type Opt = { id: string; name: string };

export function SettlementEditor({ sid, status, canEdit, unpaidTotal, decisions, customers, agents, commissionDecision, settlementAmount, notes, signedUrl }: {
  sid: string; status: string; canEdit: boolean; unpaidTotal: number; decisions: D[]; customers: Opt[]; agents: Opt[];
  commissionDecision: string; settlementAmount: number | null; notes: string; signedUrl: string | null;
}) {
  const t = useTranslations("agents");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [rows, setRows] = useState<D[]>(decisions);
  const [decision, setDecision] = useState(commissionDecision);
  const [confirm, setConfirm] = useState("");
  const done = status === "done";
  const editable = canEdit && !done;
  const set = (i: number, patch: Partial<D>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const cname = (id: string) => customers.find((c) => c.id === id)?.name ?? id;
  return (
    <div className="grid gap-4">
      <form className="grid gap-4" action={(fd) => { fd.set("decisions", JSON.stringify(rows)); run(() => saveSettlement(sid, fd)); }}>
        <fieldset disabled={!editable} className="grid gap-4">
          <div className="card">
            <h2 className="mb-1 font-bold">{t("customerDecisions")}</h2>
            {rows.length === 0 && <p className="text-sm text-brown/60">{t("noCustomers")}</p>}
            <div className="grid gap-2">
              {rows.map((r, i) => (
                <div key={r.customer_id} className="grid gap-2 rounded-xl bg-cream-light p-3 sm:grid-cols-3">
                  <b className="self-center">{cname(r.customer_id)}</b>
                  <select className="input" value={r.action} onChange={(e) => set(i, { action: e.target.value })}>
                    <option value="keep">{t("decision_keep")}</option><option value="transfer">{t("decision_transfer")}</option>
                    <option value="house">{t("decision_house")}</option>
                  </select>
                  {r.action === "transfer" && <select className="input" value={r.to_agent_id ?? ""} onChange={(e) => set(i, { to_agent_id: e.target.value })}>
                    <option value="">{t("chooseAgent")}</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>}
                  {r.action === "keep" && <input className="input" type="date" title={t("keepUntilHint")} value={r.until ?? ""} onChange={(e) => set(i, { until: e.target.value || null })} />}
                </div>
              ))}
            </div>
          </div>
          <div className="card grid gap-3 sm:grid-cols-2">
            <h2 className="font-bold sm:col-span-2">{t("unpaidCommission")}: {peso(unpaidTotal)}</h2>
            <Field label={t("commissionDecision")}>
              <Select name="commission_decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
                <option value="full">{t("decision_full")}</option><option value="partial">{t("decision_partial")}</option><option value="forfeit">{t("decision_forfeit")}</option>
              </Select>
            </Field>
            {decision === "partial" && <Field label={t("settlementAmount")}><Input name="settlement_amount" type="number" min="0" step="0.01" defaultValue={settlementAmount ?? ""} /></Field>}
            <Field label={tc("notes")} className="sm:col-span-2"><Textarea name="notes" defaultValue={notes} /></Field>
            <div className="sm:col-span-2">
              <PhotoInput name="signed" label={t("signedCopy")} accept="image/*,application/pdf" />
              {signedUrl && <a className="mt-2 inline-block font-semibold text-sunny underline" href={signedUrl} target="_blank" rel="noreferrer">{t("openSignedCopy")}</a>}
            </div>
            <Field label={tc("status")}>
              <Select name="status" defaultValue={status === "done" ? "agreed" : status}>
                <option value="draft">{t("status_draft")}</option><option value="agreed">{t("status_agreed")}</option>
              </Select>
            </Field>
          </div>
        </fieldset>
        {editable && <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{tc("save")}</button></div>}
      </form>
      {editable && status === "agreed" && (
        <div className="card grid gap-3 border-2 border-st-problem/30">
          <h2 className="font-bold">{t("applyTitle")}</h2>
          <p className="text-sm text-brown/70">{t("applyHelp")}</p>
          <div className="flex flex-wrap gap-2">
            <input className="input max-w-xs" placeholder="APPLY" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button className="btn-danger" disabled={pending || confirm.trim().toUpperCase() !== "APPLY"} onClick={() => run(() => applySettlement(sid, confirm))}>{t("applyButton")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
