"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { removeRecipeLine, saveRecipeLine } from "../actions";

/** Packaging recipe: materials + quantity per unit sold (Spec 7.2 key feature). */
export function RecipeEditor({ productId, lines, materials, canEdit }: {
  productId: string; canEdit: boolean;
  lines: { id: string; materialId: string; name: string; unit: string; qty: number }[];
  materials: { id: string; name: string; unit: string }[];
}) {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [mat, setMat] = useState("");
  const [qty, setQty] = useState("1");
  return (
    <div className="card">
      {lines.length === 0 && <p className="text-brown/60">{t("noRecipe")}</p>}
      <ul className="grid gap-2">
        {lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 rounded-xl bg-cream-light px-3 py-2">
            <span className="flex-1 font-semibold">{l.name}</span>
            <span>{l.qty} {l.unit}</span>
            {canEdit && <button className="btn-ghost btn-sm text-st-problem" disabled={pending} onClick={() => run(() => removeRecipeLine(l.id))}>{tc("remove")}</button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <select className="input flex-1" value={mat} onChange={(e) => setMat(e.target.value)}>
            <option value="">{t("chooseMaterial")}</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
          </select>
          <input className="input w-28" type="number" min="0.001" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} />
          <button className="btn-primary" disabled={!mat || pending} onClick={() => run(() => saveRecipeLine(productId, mat, Number(qty)), { onDone: () => setMat("") })}>+ {tc("add")}</button>
        </div>
      )}
    </div>
  );
}
