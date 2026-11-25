"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { peso } from "@/lib/format";
import { setTierPrice } from "../actions";

export function TierPriceGrid({ tierId, rows }: { tierId: string; rows: { productId: string; name: string; regular: number; fromPercent: number | null; price: number | null }[] }) {
  const t = useTranslations("pricing");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.productId, r.price === null ? "" : String(r.price)])));
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead><tr><th>{t("product")}</th><th className="text-right">{t("regular")}</th><th className="text-right">{t("priceInList")}</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const changed = vals[r.productId] !== (r.price === null ? "" : String(r.price));
            return (
              <tr key={r.productId}>
                <td className="font-semibold">{r.name}</td>
                <td className="text-right">{peso(r.regular)}</td>
                <td className="text-right">
                  <input className="input ml-auto w-36 text-right" type="number" min="0" step="0.01"
                    placeholder={r.fromPercent !== null ? String(r.fromPercent) : "—"} value={vals[r.productId]}
                    onChange={(e) => setVals((v) => ({ ...v, [r.productId]: e.target.value }))} />
                </td>
                <td>{changed && <button className="btn-primary btn-sm" disabled={pending}
                  onClick={() => run(() => setTierPrice(tierId, r.productId, vals[r.productId] === "" ? null : Number(vals[r.productId])))}>{tc("save")}</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
