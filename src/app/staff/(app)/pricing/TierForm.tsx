"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { saveTier } from "./actions";

export function TierForm({ tier }: { tier: Record<string, unknown> | null }) {
  const t = useTranslations("pricing");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [kind, setKind] = useState(String(tier?.kind ?? "percent"));
  return (
    <form className="grid gap-3 sm:grid-cols-4" action={(fd) => run(() => saveTier((tier?.id as string) ?? null, fd), { undo: Boolean(tier) })}>
      <Field label={tc("name")} className="sm:col-span-2"><Input name="name" required defaultValue={String(tier?.name ?? "")} /></Field>
      <Field label={t("kind")}>
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="percent">{t("kindPercent")}</option><option value="fixed">{t("kindFixed")}</option>
        </Select>
      </Field>
      {kind === "percent" && <Field label={t("percent")}><Input name="percent_off" type="number" min="0" max="100" step="0.01" defaultValue={String(tier?.percent_off ?? "0")} /></Field>}
      <label className="flex items-center gap-2 font-semibold sm:col-span-2">
        <input type="checkbox" name="active" value="on" defaultChecked={tier ? Boolean(tier.active) : true} className="h-5 w-5" /> {t("active")}
        <input type="hidden" name="active" value="off" />
      </label>
      <div className="flex justify-end sm:col-span-2"><button className="btn-primary" disabled={pending}>{tc("save")}</button></div>
    </form>
  );
}
