"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { qty as fmtQty } from "@/lib/format";
import { decideCount, saveCountLines } from "../../actions";

type Line = { id: string; name: string; unit: string; material: boolean; batch: string; system: number; counted: number | null };

export function CountSheet({ countId, status, lines, showSystem, canEdit, canApprove }: {
  countId: string; status: string; lines: Line[]; showSystem: boolean; canEdit: boolean; canApprove: boolean;
}) {
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, l.counted === null ? "" : String(l.counted)])));
  const editable = status === "draft" && canEdit;
  const payload = () => lines.map((l) => ({ id: l.id, counted: vals[l.id] === "" ? null : Number(vals[l.id]) }));
  const missing = lines.filter((l) => vals[l.id] === "").length;
  return (
    <div className="grid gap-3">
      {lines.map((l) => {
        const c = vals[l.id] === "" ? null : Number(vals[l.id]);
        const diff = c === null ? null : c - l.system;
        return (
          <div key={l.id} className="card flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <b>{l.material ? "📦 " : ""}{l.name}</b>
              {l.batch && <div className="text-xs text-brown/60">{l.batch}</div>}
              {showSystem && <div className="text-sm text-brown/70">{t("system")}: {fmtQty(l.system)} {l.unit}</div>}
            </div>
            <input className="input w-32 text-right text-lg font-bold" type="number" step="0.001" inputMode="decimal" disabled={!editable}
              value={vals[l.id]} onChange={(e) => setVals((v) => ({ ...v, [l.id]: e.target.value }))} placeholder={t("counted")} />
            {showSystem && diff !== null && (
              <span className={`w-24 text-right font-bold ${diff === 0 ? "text-st-ok" : "text-st-problem"}`}>{diff > 0 ? "+" : ""}{fmtQty(diff)}</span>
            )}
          </div>
        );
      })}
      {editable && (
        <div className="sticky bottom-20 flex flex-wrap justify-end gap-2 rounded-xl bg-cream-light/90 p-2 backdrop-blur md:bottom-2">
          <button className="btn-secondary" disabled={pending} onClick={() => run(() => saveCountLines(countId, payload(), false))}>{tc("save")}</button>
          <button className="btn-primary" disabled={pending || missing > 0} onClick={() => run(() => saveCountLines(countId, payload(), true), { success: t("countSubmitted") })}>
            {missing > 0 ? t("stillMissing", { n: missing }) : t("submitCount")}
          </button>
        </div>
      )}
      {status === "submitted" && canApprove && (
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" disabled={pending} onClick={() => run(() => decideCount(countId, false))}>{t("reject")}</button>
          <button className="btn-primary" disabled={pending} onClick={() => run(() => decideCount(countId, true), { success: t("countApproved") })}>{t("approveCount")}</button>
        </div>
      )}
    </div>
  );
}
