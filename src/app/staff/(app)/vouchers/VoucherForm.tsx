"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { saveVoucher } from "./actions";

type Opt = { id: string; name: string };
const TYPES = ["pct_order", "fixed_order", "product_discount", "free_delivery", "buy_x_get_y", "free_item"];
const AUDIENCES = ["all", "selected", "tier", "first_order", "employees"];

function toLocal(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 16); // Manila time for the date picker
}

/** Voucher builder: all 6 types and every rule (Spec 7.12). */
export function VoucherForm({ voucher, targets, products, categories, tiers, customers, canEdit }: {
  voucher: Record<string, unknown> | null; targets: { type: string; id: string }[];
  products: Opt[]; categories: Opt[]; tiers: Opt[]; customers: Opt[]; canEdit: boolean;
}) {
  const t = useTranslations("vouchers");
  const tc = useTranslations("common");
  const router = useRouter();
  const { run, pending } = useAction();
  const v = (k: string) => (voucher?.[k] ?? "") as string;
  const [type, setType] = useState(v("type") || "pct_order");
  const [audience, setAudience] = useState(v("audience") || "all");
  const [automatic, setAutomatic] = useState(voucher ? !voucher.code : false);
  const [custQ, setCustQ] = useState("");
  const chosen = useMemo(() => new Set(targets.map((x) => x.id)), [targets]);
  const filteredCustomers = customers.filter((c) => !custQ || c.name.toLowerCase().includes(custQ.toLowerCase()));
  return (
    <form className="grid gap-4" action={(fd) => run(() => saveVoucher((voucher?.id as string) ?? null, fd), {
      undo: Boolean(voucher), onDone: (id) => router.push(`/staff/vouchers/${id}`),
    })}>
      <fieldset disabled={!canEdit} className="grid gap-4">
        <div className="card grid gap-4 sm:grid-cols-2">
          <Field label={t("name")}><Input name="name" required defaultValue={v("name")} placeholder={t("namePlaceholder")} /></Field>
          <div>
            <Field label={t("code")}>
              <Input name="code" defaultValue={v("code")} disabled={automatic} placeholder="HOLIDAY10" className="font-mono uppercase" />
            </Field>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="automatic" checked={automatic} onChange={(e) => setAutomatic(e.target.checked)} className="h-5 w-5" /> {t("automaticHelp")}</label>
          </div>
          <Field label={t("type")} className="sm:col-span-2">
            <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((x, i) => <option key={x} value={x}>{i + 1}. {t(`type_${x}`)}</option>)}
            </Select>
          </Field>

          {type === "pct_order" && <>
            <Field label={t("percentOff")}><Input name="value" type="number" min="1" max="100" step="0.01" required defaultValue={v("value")} /></Field>
            <Field label={t("maxDiscount")} hint={tc("optional")}><Input name="max_discount" type="number" min="0" step="0.01" defaultValue={v("max_discount")} /></Field>
          </>}
          {type === "fixed_order" && <Field label={t("pesoOff")}><Input name="value" type="number" min="1" step="0.01" required defaultValue={v("value")} /></Field>}
          {type === "product_discount" && <>
            <Field label={t("discountKind")}>
              <Select name="value_kind" defaultValue={v("value_kind") || "percent"}>
                <option value="percent">{t("kindPercent")}</option><option value="fixed">{t("kindFixedPerUnit")}</option>
              </Select>
            </Field>
            <Field label={t("value")}><Input name="value" type="number" min="0.01" step="0.01" required defaultValue={v("value")} /></Field>
            <Field label={t("maxDiscount")} hint={tc("optional")}><Input name="max_discount" type="number" min="0" step="0.01" defaultValue={v("max_discount")} /></Field>
            <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
              <CheckList title={t("forCategories")} name="category_ids" options={categories} chosen={chosen} />
              <CheckList title={t("forProducts")} name="product_ids" options={products} chosen={chosen} />
            </div>
          </>}
          {type === "free_delivery" && <p className="text-sm text-brown/70 sm:col-span-2">{t("freeDeliveryHelp")}</p>}
          {type === "buy_x_get_y" && <>
            <Field label={t("buyProduct")}>
              <Select name="buy_product_id" required defaultValue={v("buy_product_id")}><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            </Field>
            <Field label={t("buyQty")}><Input name="buy_qty" type="number" min="1" step="1" required defaultValue={v("buy_qty") || "10"} /></Field>
            <Field label={t("getProduct")} hint={t("getProductHint")}>
              <Select name="get_product_id" defaultValue={v("get_product_id")}><option value="">{t("sameProduct")}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            </Field>
            <Field label={t("getQty")}><Input name="get_qty" type="number" min="1" step="1" required defaultValue={v("get_qty") || "1"} /></Field>
          </>}
          {type === "free_item" && <>
            <Field label={t("freeProduct")}>
              <Select name="free_product_id" required defaultValue={v("free_product_id")}><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            </Field>
            <Field label={t("freeQty")}><Input name="free_qty" type="number" min="1" step="1" required defaultValue={v("free_qty") || "1"} /></Field>
          </>}
        </div>

        <div className="card grid gap-4 sm:grid-cols-2">
          <h3 className="font-bold sm:col-span-2">{t("rules")}</h3>
          <Field label={t("minOrder")}><Input name="min_order" type="number" min="0" step="0.01" defaultValue={v("min_order") || "0"} /></Field>
          <Field label={t("whoCanUse")}>
            <Select name="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
              {AUDIENCES.map((a) => <option key={a} value={a}>{t(`aud_${a}`)}</option>)}
            </Select>
          </Field>
          {audience === "tier" && (
            <Field label={t("priceList")}>
              <Select name="tier_id" required defaultValue={v("tier_id")}><option value="">—</option>{tiers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
            </Field>
          )}
          {audience === "selected" && (
            <div className="sm:col-span-2">
              <span className="label">{t("chooseCustomers")}</span>
              <input className="input mb-2" placeholder={tc("search")} value={custQ} onChange={(e) => setCustQ(e.target.value)} />
              <div className="grid max-h-60 gap-1 overflow-y-auto rounded-xl bg-cream-light p-2 sm:grid-cols-2">
                {customers.map((c) => (
                  <label key={c.id} className={`flex items-center gap-2 text-sm ${filteredCustomers.includes(c) ? "" : "hidden"}`}>
                    <input type="checkbox" name="customer_ids" value={c.id} defaultChecked={chosen.has(c.id)} className="h-5 w-5" /> {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <Field label={t("totalLimit")} hint={t("emptyNoLimit")}><Input name="total_limit" type="number" min="1" step="1" defaultValue={v("total_limit")} /></Field>
          <Field label={t("perCustomerLimit")} hint={t("emptyNoLimit")}><Input name="per_customer_limit" type="number" min="1" step="1" defaultValue={v("per_customer_limit")} /></Field>
          <Field label={t("startAt")}><Input name="start_at" type="datetime-local" defaultValue={toLocal(voucher?.start_at ?? new Date().toISOString())} /></Field>
          <Field label={t("endAt")} hint={t("emptyNoEnd")}><Input name="end_at" type="datetime-local" defaultValue={toLocal(voucher?.end_at)} /></Field>
          <label className="flex items-center gap-2"><input type="checkbox" name="employees_allowed" defaultChecked={Boolean(voucher?.employees_allowed)} className="h-5 w-5" /> {t("employeesAllowed")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="stackable" defaultChecked={Boolean(voucher?.stackable)} className="h-5 w-5" /> {t("stackable")}</label>
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="active" defaultChecked={voucher ? Boolean(voucher.active) : true} className="h-5 w-5" /> {t("activeLabel")}</label>
        </div>
      </fieldset>
      {canEdit && <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{tc("save")}</button></div>}
    </form>
  );
}

function CheckList({ title, name, options, chosen }: { title: string; name: string; options: Opt[]; chosen: Set<string> }) {
  return (
    <div>
      <span className="label">{title}</span>
      <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl bg-cream-light p-2">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} value={o.id} defaultChecked={chosen.has(o.id)} className="h-5 w-5" /> {o.name}</label>
        ))}
      </div>
    </div>
  );
}
