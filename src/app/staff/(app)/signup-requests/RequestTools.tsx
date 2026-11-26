"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { approveSignup, rejectSignup } from "./actions";

export type Req = { id: string; area: string; full_name: string; email: string; phone: string | null; note: string | null; agent_type: string | null; created_at: string };

/** One sign-up request: who they are + Approve (pick role) / Reject (reason). */
export function RequestCard({ req, roles, teams, canDecide }: {
  req: Req; roles: { key: string; name: string }[]; teams: { id: string; name: string }[]; canDecide: boolean;
}) {
  const t = useTranslations("signupRequests");
  const { run, pending } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const defaultRole = req.area === "agent" ? (req.agent_type ?? "agent") : "office";
  return (
    <div className="card grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-lg font-bold">{req.full_name}</div>
          <div className="text-sm text-brown/70">{req.email}{req.phone ? ` · ${req.phone}` : ""}</div>
          <div className="mt-1 text-sm">
            <span className="rounded-full bg-cream px-3 py-1 font-semibold">{t(`area_${req.area}`)}</span>
            {req.area === "agent" && req.agent_type && <span className="ml-2">{t("wants", { what: t(`type_${req.agent_type}`) })}</span>}
            {req.note && <span className="ml-2">“{req.note}”</span>}
          </div>
        </div>
        <div className="text-xs text-brown/60">{new Date(req.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</div>
      </div>
      {canDecide && !rejecting && (
        <form className="grid gap-3 sm:grid-cols-3" action={(fd) => run(() => approveSignup(req.id, fd), { success: t("approved") })}>
          <Field label={t("role")}>
            <Select name="role_key" required defaultValue={defaultRole}>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select>
          </Field>
          {req.area === "internal" ? (
            <Field label={t("team")}><Select name="team_id" defaultValue=""><option value="">—</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          ) : (
            <Field label={t("rate")} hint={t("rateHint")}><Input name="default_rate" type="number" min={0} step="0.01" defaultValue={0} /></Field>
          )}
          <div className="flex items-end gap-2">
            <button className="btn-primary flex-1" disabled={pending}>{t("approve")}</button>
            <button type="button" className="btn-ghost text-st-problem" onClick={() => setRejecting(true)}>{t("reject")}</button>
          </div>
        </form>
      )}
      {canDecide && rejecting && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input className="input" placeholder={t("reasonHint")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-secondary text-st-problem" disabled={pending} onClick={() => run(() => rejectSignup(req.id, reason), { success: t("rejected") })}>{t("confirmReject")}</button>
          <button className="btn-ghost" onClick={() => setRejecting(false)}>{t("cancel")}</button>
        </div>
      )}
    </div>
  );
}
