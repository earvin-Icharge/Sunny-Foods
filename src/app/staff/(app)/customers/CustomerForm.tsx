"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { saveCustomer } from "./actions";

const TYPES = ["restaurant", "cafe", "retailer", "distributor", "private_label", "employee", "other"];
const TERMS = ["cash", "cod", "prepaid", "credit_7", "credit_15", "credit_30"];
const METHODS = ["cash", "cod", "bank_transfer", "gcash", "maya", "cheque"];

export function CustomerForm({ customer, tiers, canEdit, canSetTier, showContact, showAddress }: {
  customer: Record<string, unknown> | null; tiers: { id: string; name: string }[];
  canEdit: boolean; canSetTier: boolean; showContact: boolean; showAddress: boolean;
}) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const router = useRouter();
  const { run, pending } = useAction();
  const lat = useRef<HTMLInputElement>(null);
  const lng = useRef<HTMLInputElement>(null);
  const v = (k: string) => (customer?.[k] ?? "") as string;
  const allowed = (customer?.allowed_payment_methods as string[] | undefined) ?? ["cash", "cod", "bank_transfer", "gcash", "maya"];
  const mapsUrl = v("lat") && v("lng") ? `https://www.google.com/maps?q=${v("lat")},${v("lng")}` : v("address") ? `https://www.google.com/maps/search/${encodeURIComponent(v("address"))}` : null;
  return (
    <form className="grid gap-4" action={(fd) => run(() => saveCustomer((customer?.id as string) ?? null, fd), {
      undo: Boolean(customer), onDone: (id) => { if (!customer) router.push(`/staff/customers/${id}`); },
    })}>
      <fieldset disabled={!canEdit} className="grid gap-4">
        <div className="card grid gap-4 sm:grid-cols-2">
          <Field label={t("name")}><Input name="name" required defaultValue={v("name")} /></Field>
          <Field label={t("code")} hint={tc("optional")}><Input name="code" defaultValue={v("code")} /></Field>
          <Field label={t("businessType")}>
            <Select name="business_type" defaultValue={v("business_type") || "restaurant"}>
              {TYPES.map((x) => <option key={x} value={x}>{t(`type_${x}`)}</option>)}
            </Select>
          </Field>
          {showContact && <>
            <Field label={t("contactPerson")}><Input name="contact_person" defaultValue={v("contact_person")} /></Field>
            <Field label={tc("phone")}><Input name="phone" type="tel" defaultValue={v("phone")} /></Field>
            <Field label={tc("email")}><Input name="email" type="email" defaultValue={v("email")} /></Field>
          </>}
        </div>
        {showAddress && (
          <div className="card grid gap-4 sm:grid-cols-2">
            <Field label={tc("address")} className="sm:col-span-2"><Textarea name="address" defaultValue={v("address")} /></Field>
            <Field label={t("lat")}><Input ref={lat} name="lat" type="number" step="0.0000001" defaultValue={v("lat")} /></Field>
            <Field label={t("lng")}><Input ref={lng} name="lng" type="number" step="0.0000001" defaultValue={v("lng")} /></Field>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => navigator.geolocation?.getCurrentPosition((p) => {
                if (lat.current) lat.current.value = p.coords.latitude.toFixed(7);
                if (lng.current) lng.current.value = p.coords.longitude.toFixed(7);
              })}>📍 {t("useMyLocation")}</button>
              {mapsUrl && <a className="btn-secondary btn-sm" href={mapsUrl} target="_blank" rel="noreferrer">🗺️ {t("openMaps")}</a>}
            </div>
          </div>
        )}
        <div className="card grid gap-4 sm:grid-cols-2">
          <Field label={t("deliveryMethod")}>
            <Select name="default_delivery_method" defaultValue={v("default_delivery_method") || "own_truck"}>
              <option value="own_truck">{t("dm_own_truck")}</option><option value="courier">{t("dm_courier")}</option><option value="pickup">{t("dm_pickup")}</option>
            </Select>
          </Field>
          <Field label={t("paymentTerms")} hint={t("creditHint")}>
            <Select name="payment_terms" defaultValue={v("payment_terms") || "cod"}>
              {TERMS.map((x) => <option key={x} value={x}>{t(`pt_${x}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("priceTier")} hint={canSetTier ? undefined : t("bossOnly")}>
            <Select name={canSetTier ? "price_tier_id" : "_tier"} defaultValue={v("price_tier_id")} disabled={!canSetTier}>
              <option value="">{t("regularPrice")}</option>
              {tiers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
          <fieldset className="sm:col-span-2">
            <span className="label">{t("allowedPayments")}</span>
            <div className="flex flex-wrap gap-3">
              {METHODS.map((m) => (
                <label key={m} className="flex min-h-10 items-center gap-2 rounded-lg bg-cream-light px-3">
                  <input type="checkbox" name="allowed_payment_methods" value={m} defaultChecked={allowed.includes(m)} className="h-5 w-5" /> {t(`pm_${m}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t("internalNotes")} hint={t("internalNotesHint")} className="sm:col-span-2"><Textarea name="notes" defaultValue={v("notes")} /></Field>
        </div>
      </fieldset>
      {canEdit && <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{tc("save")}</button></div>}
    </form>
  );
}
