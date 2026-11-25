"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { peso } from "@/lib/format";
import {
  addPortalUser, approveCustomer, linkAgent, removeAddress, removeEmployeeLimit, removePortalUser, saveAddress,
  saveEmployeeLimit, setCustomerStatus, setSpecialPrice,
} from "../actions";

type Opt = { id: string; name: string };
const TERMS = ["cash", "cod", "prepaid", "credit_7", "credit_15", "credit_30"];

/** Approve or reject a pending sign-up: set payment terms + price list first (Spec 7.10). */
export function ApprovePanel({ id, terms, tierId, tiers, permitUrl, referral }: { id: string; terms: string; tierId: string; tiers: Opt[]; permitUrl: string | null; referral: string | null }) {
  const t = useTranslations("customers");
  const { run, pending } = useAction();
  const [pt, setPt] = useState(terms || "cod");
  const [tier, setTier] = useState(tierId || "");
  return (
    <div className="card mb-5 ring-2 ring-gold">
      <h2 className="text-lg font-bold">{t("pendingTitle")}</h2>
      <p className="mb-3 text-sm text-brown/70">{t("pendingHelp")}</p>
      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        {permitUrl && <a className="btn-secondary btn-sm" href={permitUrl} target="_blank" rel="noreferrer">📄 {t("viewPermit")}</a>}
        {referral && <span className="rounded-lg bg-cream px-3 py-2">{t("referralCode")}: <b>{referral}</b></span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("paymentTerms")}>
          <Select value={pt} onChange={(e) => setPt(e.target.value)}>{TERMS.map((x) => <option key={x} value={x}>{t(`pt_${x}`)}</option>)}</Select>
        </Field>
        <Field label={t("priceTier")}>
          <Select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">{t("regularPrice")}</option>{tiers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className="btn-secondary" disabled={pending} onClick={() => { if (confirm(t("rejectConfirm"))) run(() => approveCustomer(id, pt, tier || null, false), { success: t("rejectedMsg") }); }}>{t("reject")}</button>
        <button className="btn-primary" disabled={pending} onClick={() => run(() => approveCustomer(id, pt, tier || null, true), { success: t("approvedMsg") })}>✓ {t("approve")}</button>
      </div>
    </div>
  );
}

export function StatusButton({ id, status }: { id: string; status: string }) {
  const t = useTranslations("customers");
  const { run, pending } = useAction();
  if (status === "suspended") {
    return <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setCustomerStatus(id, "approved"), { undo: true })}>{t("reactivate")}</button>;
  }
  if (status !== "approved") return null;
  return <button className="btn-secondary btn-sm" disabled={pending} onClick={() => { if (confirm(t("suspendConfirm"))) run(() => setCustomerStatus(id, "suspended"), { undo: true }); }}>{t("suspend")}</button>;
}

/** Special price per product for this customer (boss only). */
export function SpecialPrices({ customerId, rows }: { customerId: string; rows: { productId: string; name: string; regular: number | null; tier: number | null; special: number | null }[] }) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.productId, r.special === null ? "" : String(r.special)])));
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead><tr><th>{t("product")}</th><th className="text-right">{t("regularPrice")}</th><th className="text-right">{t("tierPrice")}</th><th className="text-right">{t("specialPrice")}</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const changed = (vals[r.productId] ?? "") !== (r.special === null ? "" : String(r.special));
            return (
              <tr key={r.productId}>
                <td className="font-semibold">{r.name}</td>
                <td className="text-right">{peso(r.regular)}</td>
                <td className="text-right text-brown/70">{r.tier !== null && r.tier !== r.regular ? peso(r.tier) : "—"}</td>
                <td className="text-right"><input className="input ml-auto w-32 text-right" type="number" min="0" step="0.01" placeholder="—"
                  value={vals[r.productId] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [r.productId]: e.target.value }))} /></td>
                <td>{changed && <button className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => setSpecialPrice(customerId, r.productId, vals[r.productId] === "" ? null : Number(vals[r.productId])))}>{tc("save")}</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-brown/60">{t("specialHelp")}</p>
    </div>
  );
}

/** Assigned agent/broker — boss only, logged, applies to new orders only. */
export function AgentLink({ customerId, agentId, agents }: { customerId: string; agentId: string; agents: Opt[] }) {
  const t = useTranslations("customers");
  const { run, pending } = useAction();
  const [a, setA] = useState(agentId);
  return (
    <div className="flex flex-wrap gap-2">
      <select className="input flex-1" value={a} onChange={(e) => setA(e.target.value)}>
        <option value="">{t("houseAccount")}</option>
        {agents.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <button className="btn-primary" disabled={pending || a === agentId} onClick={() => { if (confirm(t("agentChangeConfirm"))) run(() => linkAgent(customerId, a || null)); }}>{t("changeAgent")}</button>
    </div>
  );
}

/** Company users with portal logins (one company can have several users). */
export function UsersPanel({ customerId, users, canAdd, canRemove }: { customerId: string; users: { id: string; name: string; email: string; primary: boolean; active: boolean }[]; canAdd: boolean; canRemove: boolean }) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  return (
    <div className="card">
      {users.length === 0 && <p className="text-sm text-brown/60">{t("noUsers")}</p>}
      <ul className="grid gap-2">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream-light px-3 py-2">
            <span className="flex-1"><b>{u.name}</b> · {u.email} {u.primary && <span className="rounded bg-gold/20 px-2 text-xs">{t("primary")}</span>} {!u.active && <span className="text-xs text-st-problem">{t("inactive")}</span>}</span>
            {canRemove && <button className="btn-ghost btn-sm text-st-problem" disabled={pending} onClick={() => { if (confirm(t("removeUserConfirm"))) run(() => removePortalUser(customerId, u.id)); }}>{tc("remove")}</button>}
          </li>
        ))}
      </ul>
      {created && (
        <div className="mt-3 rounded-xl bg-st-ok/10 p-3 text-sm">
          <b>{t("loginCreated")}</b><br />{tc("email")}: <code>{created.email}</code><br />{t("tempPassword")}: <code className="text-lg font-bold">{created.password}</code>
          <p className="mt-1 text-brown/70">{t("tempPasswordHelp")}</p>
        </div>
      )}
      {canAdd && (
        <form className="mt-3 grid gap-2 sm:grid-cols-3" action={(fd) => run(() => addPortalUser(customerId, fd), { onDone: (d) => setCreated(d) })}>
          <Input name="full_name" placeholder={tc("name")} required />
          <Input name="email" type="email" placeholder={tc("email")} required />
          <button className="btn-primary" disabled={pending}>+ {t("addUser")}</button>
        </form>
      )}
    </div>
  );
}

export function AddressesPanel({ customerId, rows, canEdit }: { customerId: string; rows: { id: string; label: string; address: string; isDefault: boolean; lat: number | null; lng: number | null }[]; canEdit: boolean }) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  return (
    <div className="card">
      {rows.length === 0 && <p className="text-sm text-brown/60">{t("noAddresses")}</p>}
      <ul className="grid gap-2">
        {rows.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream-light px-3 py-2">
            <span className="flex-1"><b>{a.label}</b>{a.isDefault && <span className="ml-1 rounded bg-gold/20 px-2 text-xs">{t("default")}</span>}<br /><span className="text-sm">{a.address}</span></span>
            <a className="btn-ghost btn-sm" target="_blank" rel="noreferrer" href={a.lat && a.lng ? `https://www.google.com/maps?q=${a.lat},${a.lng}` : `https://www.google.com/maps/search/${encodeURIComponent(a.address)}`}>🗺️</a>
            {canEdit && <button className="btn-ghost btn-sm text-st-problem" disabled={pending} onClick={() => run(() => removeAddress(customerId, a.id))}>{tc("remove")}</button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form className="mt-3 grid gap-2 sm:grid-cols-6" action={(fd) => run(() => saveAddress(customerId, null, fd))}>
          <Input name="label" placeholder={t("addressLabel")} className="sm:col-span-1" />
          <Input name="address" placeholder={tc("address")} required className="sm:col-span-3" />
          <Input name="lat" type="number" step="0.0000001" placeholder={t("lat")} />
          <Input name="lng" type="number" step="0.0000001" placeholder={t("lng")} />
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="is_default" className="h-5 w-5" /> {t("makeDefault")}</label>
          <button className="btn-secondary sm:col-span-3" disabled={pending}>+ {t("addAddress")}</button>
        </form>
      )}
    </div>
  );
}

/** Employee monthly limits (pesos and/or packs per product). */
export function EmployeeLimits({ customerId, rows, products, canEdit }: { customerId: string; rows: { id: string; product: string | null; amount: number | null; packs: number | null }[]; products: Opt[]; canEdit: boolean }) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [prod, setProd] = useState("");
  return (
    <div className="card">
      {rows.length === 0 && <p className="text-sm text-brown/60">{t("noLimits")}</p>}
      <ul className="grid gap-2">
        {rows.map((l) => (
          <li key={l.id} className="flex items-center gap-2 rounded-xl bg-cream-light px-3 py-2">
            <span className="flex-1">{l.product ? <>{l.product}: <b>{l.packs} {t("packsPerMonth")}</b></> : <>{t("wholeOrder")}: <b>{peso(l.amount)} {t("perMonth")}</b></>}</span>
            {canEdit && <button className="btn-ghost btn-sm text-st-problem" disabled={pending} onClick={() => run(() => removeEmployeeLimit(customerId, l.id))}>{tc("remove")}</button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form className="mt-3 grid gap-2 sm:grid-cols-3" action={(fd) => run(() => saveEmployeeLimit(customerId, fd))}>
          <Select name="product_id" value={prod} onChange={(e) => setProd(e.target.value)}>
            <option value="">{t("wholeOrderPesos")}</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          {prod ? <Input name="monthly_packs" type="number" min="1" step="1" placeholder={t("packsPerMonth")} required />
                : <Input name="monthly_amount" type="number" min="1" step="0.01" placeholder={t("pesosPerMonth")} required />}
          <button className="btn-secondary" disabled={pending}>{tc("save")}</button>
        </form>
      )}
    </div>
  );
}
