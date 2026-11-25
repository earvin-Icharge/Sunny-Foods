"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { useToast } from "@/components/ui/Toast";
import { adjustStock, stockIn } from "./actions";

type Item = { id: string; label: string; unit: string; storage?: string };
const LOCATIONS = ["freezer_1", "freezer_2", "chiller", "shelf"];

/** Stock In (by batch) and Adjust / Spoilage / Return (reason required). */
export function StockForm({ mode, products, materials, batches, today }: {
  mode: "in" | "adjust"; products: Item[]; materials: Item[]; batches: { id: string; itemId: string; label: string }[]; today: string;
}) {
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const router = useRouter();
  const { run, pending } = useAction();
  const toast = useToast();
  const [type, setType] = useState<"product" | "material">("product");
  const [item, setItem] = useState("");
  const [kind, setKind] = useState("adjustment");
  const list = type === "product" ? products : materials;
  const unit = list.find((i) => i.id === item)?.unit ?? "";
  const storage = list.find((i) => i.id === item)?.storage;
  const itemBatches = batches.filter((b) => b.itemId === item);
  return (
    <form className="card grid max-w-2xl gap-4" action={(fd) => run(() => (mode === "in" ? stockIn(fd) : adjustStock(fd)), {
      success: mode === "in" ? t("stockedIn") : undefined,
      onDone: (res) => { if (mode === "adjust" && res === "pending_approval") toast.show(t("waitingApproval")); router.push("/staff/inventory"); },
    })}>
      <div className="grid grid-cols-2 gap-2">
        {(["product", "material"] as const).map((x) => (
          <button type="button" key={x} onClick={() => { setType(x); setItem(""); }}
            className={`btn ${type === x ? "bg-sunny text-white" : "bg-cream text-brown"}`}>{x === "product" ? `🥩 ${t("products")}` : `📦 ${t("packaging")}`}</button>
        ))}
      </div>
      <input type="hidden" name="item_type" value={type} />
      <Field label={t("item")}>
        <Select name="item_id" required value={item} onChange={(e) => setItem(e.target.value)}>
          <option value="">{t("chooseItem")}</option>
          {list.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </Select>
      </Field>
      {mode === "in" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("batchNo")} hint={t("batchNoHint")}><Input name="batch_no" /></Field>
          <Field label={t("location")}>
            <Select name="location" defaultValue={type === "material" ? "shelf" : storage === "chilled" ? "chiller" : storage === "room" ? "shelf" : "freezer_1"} key={item + type}>
              {LOCATIONS.map((l) => <option key={l} value={l}>{t(`loc_${l}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("productionDate")}><Input name="production_date" type="date" defaultValue={today} /></Field>
          <Field label={t("expiryDate")}><Input name="expiry_date" type="date" required={type === "product"} /></Field>
          <Field label={`${t("quantity")} ${unit}`}><Input name="qty" type="number" min="0.001" step="0.001" required inputMode="decimal" /></Field>
          <Field label={tc("notes")}><Input name="notes" /></Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("kind")}>
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="adjustment">{t("kind_adjustment")}</option>
              <option value="spoilage">{t("kind_spoilage")}</option>
              <option value="return">{t("kind_return")}</option>
            </Select>
          </Field>
          {kind === "adjustment" && (
            <Field label={t("direction")}>
              <Select name="direction" defaultValue="minus">
                <option value="minus">− {t("remove")}</option><option value="plus">+ {t("add")}</option>
              </Select>
            </Field>
          )}
          <Field label={t("batch")} className="sm:col-span-2">
            <Select name="batch_id" defaultValue="">
              <option value="">{t("noBatch")}</option>
              {itemBatches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Select>
          </Field>
          <Field label={`${t("quantity")} ${unit}`}><Input name="qty" type="number" min="0.001" step="0.001" required inputMode="decimal" /></Field>
          <Field label={t("reasonRequired")} className="sm:col-span-2"><Textarea name="reason" required /></Field>
        </div>
      )}
      <div className="flex justify-end"><button className="btn-primary" disabled={pending || !item}>{tc("save")}</button></div>
    </form>
  );
}
