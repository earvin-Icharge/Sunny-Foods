"use client";
import { useTranslations } from "next-intl";
import { Field, Input } from "@/components/ui/Field";
import { PhotoInput } from "@/components/ui/PhotoInput";
import { useAction } from "@/components/ui/useAction";
import { saveMaterial } from "../actions";

export function MaterialForm({ material, showCost }: { material: Record<string, unknown> | null; showCost: boolean }) {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const v = (k: string) => (material?.[k] ?? "") as string;
  return (
    <form className="grid gap-3 sm:grid-cols-2" action={(fd) => run(() => saveMaterial((material?.id as string) ?? null, fd))}>
      <Field label={t("code")}><Input name="code" required defaultValue={v("code")} /></Field>
      <Field label={t("unit")}><Input name="unit" defaultValue={v("unit") || "pc"} /></Field>
      <Field label={t("nameEn")}><Input name="name" required defaultValue={v("name")} /></Field>
      <Field label={t("nameZhHans")}><Input name="name_zh_hans" defaultValue={v("name_zh_hans")} /></Field>
      <Field label={t("nameZhHant")}><Input name="name_zh_hant" defaultValue={v("name_zh_hant")} /></Field>
      <Field label={t("nameTl")}><Input name="name_tl" defaultValue={v("name_tl")} /></Field>
      <Field label={t("lowStockLevel")}><Input name="low_stock_level" type="number" min="0" step="0.01" defaultValue={v("low_stock_level") || "0"} /></Field>
      {showCost && <Field label={t("cost")}><Input name="cost" type="number" min="0" step="0.01" defaultValue={v("cost")} /></Field>}
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" name="active" value="on" defaultChecked={material ? Boolean(material.active) : true} className="h-5 w-5" /> {t("active")}
        <input type="hidden" name="active" value="off" />
      </label>
      <div className="sm:col-span-2"><PhotoInput name="photo" label={t("photo")} /></div>
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={pending}>{tc("save")}</button></div>
    </form>
  );
}
