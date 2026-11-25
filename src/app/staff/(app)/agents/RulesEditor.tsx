"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { peso } from "@/lib/format";
import { deleteRule, saveRule, toggleRule } from "./actions";

type Rule = { id: string; scope: string; target: string; rateKind: string; rate: number; minSales: number | null; maxMonths: number | null; active: boolean };
type Opt = { id: string; name: string };

/** Commission rules: product / category overrides and monthly sales tiers (Spec 7.13). */
export function RulesEditor({ agentId, rules, products, categories, canEdit, defaultNote }: {
  agentId: string | null; rules: Rule[]; products: Opt[]; categories: Opt[]; canEdit: boolean; defaultNote?: string;
}) {
  const t = useTranslations("agents");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [scope, setScope] = useState("category");
  return (
    <div className="grid gap-4">
      <div className="card">
        {defaultNote && <p className="mb-2 text-sm font-semibold">{defaultNote}</p>}
        <p className="mb-3 text-sm text-brown/70">{t("rulesHelp")}</p>
        {rules.length === 0 && <p className="text-brown/60">{t("noRules")}</p>}
        <ul className="grid gap-2">
          {rules.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center gap-3 rounded-xl bg-cream-light px-3 py-2 ${r.active ? "" : "opacity-50"}`}>
              <span className="flex-1">
                <b>{t(`scope_${r.scope}`)}</b>{r.target ? `: ${r.target}` : ""}
                {r.scope === "monthly_tier" && <> — {t("fromSales", { amount: peso(r.minSales ?? 0) })}</>}
              </span>
              <span className="font-semibold">{r.rateKind === "percent" ? `${r.rate}%` : `${peso(r.rate)} ${r.scope === "monthly_tier" ? t("perOrder") : t("perUnit")}`}</span>
              {r.maxMonths ? <span className="text-xs">{t("firstMonths", { n: r.maxMonths })}</span> : null}
              {canEdit && <>
                <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => toggleRule(r.id, !r.active))}>{r.active ? t("pause") : t("resume")}</button>
                <button className="btn-ghost btn-sm text-st-problem" disabled={pending} onClick={() => run(() => deleteRule(r.id))}>{tc("remove")}</button>
              </>}
            </li>
          ))}
        </ul>
      </div>
      {canEdit && (
        <form className="card grid gap-3 sm:grid-cols-3" action={(fd) => run(() => saveRule(agentId, fd))}>
          <h2 className="font-bold sm:col-span-3">{t("addRule")}</h2>
          <Field label={t("ruleType")}>
            <Select name="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="category">{t("scope_category")}</option><option value="product">{t("scope_product")}</option>
              <option value="monthly_tier">{t("scope_monthly_tier")}</option>
            </Select>
          </Field>
          {scope === "product" && <Field label={t("product")}><Select name="product_id" required><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
          {scope === "category" && <Field label={t("category")}><Select name="category_id" required><option value="">—</option>{categories.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
          {scope === "monthly_tier" && <Field label={t("minMonthlySales")}><Input name="min_monthly_sales" type="number" min="0" step="1000" required /></Field>}
          <Field label={t("rateKind")}>
            <Select name="rate_kind" defaultValue="percent">
              <option value="percent">{t("percent")}</option>
              <option value="fixed">{scope === "monthly_tier" ? t("fixedPerOrder") : t("fixedPerUnit")}</option>
            </Select>
          </Field>
          <Field label={t("rate")}><Input name="rate" type="number" min="0" step="0.01" required /></Field>
          <Field label={t("maxMonths")} hint={t("maxMonthsHint")}><Input name="max_months" type="number" min="1" /></Field>
          <div className="flex items-end justify-end sm:col-span-3"><button className="btn-primary" disabled={pending}>+ {tc("add")}</button></div>
        </form>
      )}
    </div>
  );
}
