"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { PhotoInput } from "@/components/ui/PhotoInput";
import { useAction } from "@/components/ui/useAction";
import { saveProduct } from "./actions";

type P = Record<string, unknown> | null;

export function ProductForm({ product, categories, showPrice, showCost, canEdit, photoUrl, packingPhotoUrl }: {
  product: P; categories: { id: string; name: string }[]; showPrice: boolean; showCost: boolean; canEdit: boolean;
  photoUrl?: string | null; packingPhotoUrl?: string | null;
}) {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  const router = useRouter();
  const { run, pending } = useAction();
  const v = (k: string) => (product?.[k] ?? "") as string;
  return (
    <form className="grid gap-4" action={(fd) => run(() => saveProduct((product?.id as string) ?? null, fd), {
      undo: Boolean(product), onDone: (id) => { if (!product) router.push(`/staff/products/${id}`); },
    })}>
      <fieldset disabled={!canEdit} className="grid gap-4">
        <div className="card grid gap-4 sm:grid-cols-2">
          <Field label={t("sku")}><Input name="sku" required defaultValue={v("sku")} /></Field>
          <Field label={t("category")}>
            <Select name="category_id" defaultValue={v("category_id")}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label={t("nameEn")}><Input name="name" required defaultValue={v("name")} /></Field>
          <Field label={t("nameZhHans")}><Input name="name_zh_hans" defaultValue={v("name_zh_hans")} /></Field>
          <Field label={t("nameZhHant")}><Input name="name_zh_hant" defaultValue={v("name_zh_hant")} /></Field>
          <Field label={t("nameTl")}><Input name="name_tl" defaultValue={v("name_tl")} /></Field>
          <Field label={t("description")} className="sm:col-span-2"><Textarea name="description" defaultValue={v("description")} /></Field>
        </div>
        <div className="card grid gap-4 sm:grid-cols-3">
          <Field label={t("unit")}>
            <Select name="unit" defaultValue={v("unit") || "pack"}>
              <option value="pack">{t("unitPack")}</option><option value="kg">{t("unitKg")}</option><option value="box">{t("unitBox")}</option>
            </Select>
          </Field>
          <Field label={t("packWeight")}><Input name="pack_weight_g" type="number" step="0.01" min="0" defaultValue={v("pack_weight_g")} /></Field>
          <Field label={t("storage")}>
            <Select name="storage" defaultValue={v("storage") || "frozen"}>
              <option value="frozen">{t("frozen")}</option><option value="chilled">{t("chilled")}</option><option value="room">{t("room")}</option>
            </Select>
          </Field>
          {showPrice && <Field label={t("defaultPrice")}><Input name="default_price" type="number" step="0.01" min="0" defaultValue={v("default_price")} /></Field>}
          {showCost && <Field label={t("cost")}><Input name="cost" type="number" step="0.01" min="0" defaultValue={v("cost")} /></Field>}
          <Field label={t("lowStockLevel")}><Input name="low_stock_level" type="number" step="0.01" min="0" defaultValue={v("low_stock_level") || "0"} /></Field>
          <Field label={t("vatType")}>
            <Select name="vat_type" defaultValue={v("vat_type") || "vatable"}>
              <option value="vatable">{t("vatable")}</option><option value="exempt">{t("vatExempt")}</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="active" defaultChecked={product ? Boolean(product.active) : true} className="h-5 w-5" /> {t("active")}</label>
        </div>
        <div className="card grid gap-4 sm:grid-cols-2">
          <PhotoInput name="photo" label={t("photo")} currentUrl={photoUrl} />
          <PhotoInput name="packing_photo" label={t("packingPhoto")} currentUrl={packingPhotoUrl} />
          <Field label={t("packingInstruction") + " (EN)"}><Textarea name="packing_instruction" defaultValue={v("packing_instruction")} /></Field>
          <Field label={t("packingInstruction") + " (简体)"}><Textarea name="packing_instruction_zh_hans" defaultValue={v("packing_instruction_zh_hans")} /></Field>
          <Field label={t("packingInstruction") + " (繁體)"}><Textarea name="packing_instruction_zh_hant" defaultValue={v("packing_instruction_zh_hant")} /></Field>
          <Field label={t("packingInstruction") + " (TL)"}><Textarea name="packing_instruction_tl" defaultValue={v("packing_instruction_tl")} /></Field>
        </div>
      </fieldset>
      {canEdit && <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{pending ? "…" : tc("save")}</button></div>}
    </form>
  );
}
