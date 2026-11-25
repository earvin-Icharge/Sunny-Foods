"use client";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { saveCategory } from "../actions";

export function CategoryForm({ category }: { category: Record<string, unknown> | null }) {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const v = (k: string) => (category?.[k] ?? "") as string;
  return (
    <form className="grid gap-3 sm:grid-cols-2" action={(fd) => run(() => saveCategory((category?.id as string) ?? null, fd))}>
      <Field label={t("nameEn")}><Input name="name" required defaultValue={v("name")} /></Field>
      <Field label={t("nameZhHans")}><Input name="name_zh_hans" defaultValue={v("name_zh_hans")} /></Field>
      <Field label={t("nameZhHant")}><Input name="name_zh_hant" defaultValue={v("name_zh_hant")} /></Field>
      <Field label={t("nameTl")}><Input name="name_tl" defaultValue={v("name_tl")} /></Field>
      <Field label={t("sort")}><Input name="sort" type="number" defaultValue={v("sort") || "100"} /></Field>
      <Field label={t("vatType")} hint={t("categoryVatHint")}>
        <Select name="vat_type" defaultValue={v("vat_type") || "vatable"}>
          <option value="vatable">{t("vatable")}</option><option value="exempt">{t("vatExempt")}</option>
        </Select>
      </Field>
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={pending}>{tc("save")}</button></div>
    </form>
  );
}
