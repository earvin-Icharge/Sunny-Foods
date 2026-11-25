"use client";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, postJson } from "@/lib/portal-client";
import { date, peso } from "@/lib/format";
import { PhotoInput } from "@/components/ui/PhotoInput";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

type Account = {
  customer: { id: string; name: string; business_type: string; contact_person: string | null; phone: string | null; email: string | null;
    address: string | null; lat: number | null; lng: number | null; status: string; payment_terms: string; is_employee_account: boolean };
  balance: number;
  addresses: { id: string; label: string; address: string; lat: number | null; lng: number | null; is_default: boolean }[];
  users: { id: string; full_name: string; email: string | null; is_primary: boolean }[];
  payments: { id: string; order_no: string; amount: number; method: string; paid_at: string; reference: string | null }[];
  proofs: { id: string; amount: number; method: string; status: string; created_at: string; review_note: string | null }[];
  employee_allowance: { product_id: string | null; monthly_amount: number | null; spent: number }[] | null;
  data_requests: { kind: string; status: string; created_at: string }[];
  me: { id: string; name: string; email: string | null };
};
type OrderRow = { id: string; order_no: string; total: number; payment_status: string; status: string };

/** My Account (Spec 7.10): company, addresses, users, balance, payments, payment proof upload, privacy. */
export function AccountView({ payOrderId }: { payOrderId?: string }) {
  const t = useTranslations("portal");
  const tb = useTranslations("orderBreakdown");
  const locale = useLocale();
  const toast = useToast();
  const [a, setA] = useState<Account | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState<Record<string, string>>({});
  const [addr, setAddr] = useState({ label: "", address: "", lat: "", lng: "", is_default: false });
  const [confirmDelete, setConfirmDelete] = useState("");
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    const [r, o] = await Promise.all([api<Account>("/api/portal/account"), api<{ items: OrderRow[] }>("/api/portal/orders")]);
    if (r.ok) {
      setA(r.data);
      const c = r.data.customer;
      setCompany({ contact_person: c.contact_person ?? "", phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "",
        lat: c.lat?.toString() ?? "", lng: c.lng?.toString() ?? "" });
    } else setErr(r.error);
    if (o.ok) setOrders(o.data.items.filter((x) => x.payment_status !== "paid" && x.status !== "cancelled"));
  }, []);
  useEffect(() => { const id = setTimeout(load, 0); return () => clearTimeout(id); }, [load]);

  async function save<T>(p: Promise<{ ok: boolean; error?: string; data?: T }>, msg: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) { toast.show(r.error ?? "Error", "error"); return false; }
    toast.show(msg);
    load();
    return true;
  }

  function locate(set: (lat: string, lng: string) => void) {
    navigator.geolocation?.getCurrentPosition((pos) => set(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6)),
      () => toast.show(t("locationFailed"), "error"));
  }

  if (err) return <p className="card text-st-problem">{err}</p>;
  if (!a) return <p className="py-10 text-center text-brown/60">{t("loading")}</p>;
  const allowance = a.employee_allowance?.find((x) => x.product_id === null && x.monthly_amount !== null);
  const deletionPending = a.data_requests.some((r) => r.kind === "deletion" && r.status === "pending");

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><div className="text-sm text-brown/60">{t("balance")}</div><div className={`text-2xl font-bold ${a.balance > 0 ? "text-st-problem" : "text-st-ok"}`}>{peso(a.balance)}</div></div>
        <div className="card"><div className="text-sm text-brown/60">{t("paymentTerms")}</div><div className="text-xl font-bold">{tb(a.customer.payment_terms)}</div></div>
        <div className="card"><div className="text-sm text-brown/60">{t("accountStatus")}</div><div className="mt-1"><StatusBadge kind="generic" status={a.customer.status} /></div></div>
      </div>
      {allowance && <p className="rounded-xl bg-st-ok/10 p-3">{t("employeeAllowance", { left: peso(Math.max(Number(allowance.monthly_amount) - Number(allowance.spent), 0)), limit: peso(allowance.monthly_amount) })}</p>}

      <section className="card grid gap-3">
        <h2 className="text-lg font-bold">{a.customer.name}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["contact_person", "phone", "email"] as const).map((k) => (
            <label key={k}><span className="label">{t(`field_${k}`)}</span>
              <input className="input" value={company[k] ?? ""} onChange={(e) => setCompany({ ...company, [k]: e.target.value })} /></label>
          ))}
          <label className="sm:col-span-2"><span className="label">{t("field_address")}</span>
            <textarea className="input py-3" rows={2} value={company.address ?? ""} onChange={(e) => setCompany({ ...company, address: e.target.value })} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button className="btn-secondary btn-sm" onClick={() => locate((lat, lng) => setCompany({ ...company, lat, lng }))}>📍 {t("useMyLocation")}</button>
          {company.lat && <a className="text-sunny underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${company.lat},${company.lng}`}>{t("viewMap")}</a>}
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={busy} onClick={() => save(postJson("/api/portal/account", company, "PATCH"), t("saved"))}>{t("save")}</button>
        </div>
      </section>

      <section className="card grid gap-3">
        <h2 className="text-lg font-bold">{t("addresses")}</h2>
        <ul className="grid gap-2">
          {a.addresses.map((x) => (
            <li key={x.id} className="flex items-start gap-3 rounded-xl bg-cream-light p-3">
              <div className="flex-1"><b>{x.label}</b>{x.is_default && <span className="ml-2 rounded bg-gold/30 px-1.5 text-xs">{t("default")}</span>}
                <div className="text-sm text-brown/70">{x.address}</div></div>
              {!x.is_default && <button className="btn-ghost btn-sm" onClick={() => save(postJson("/api/portal/addresses", { ...x, is_default: true }), t("saved"))}>{t("makeDefault")}</button>}
              <button className="btn-ghost btn-sm text-st-problem" onClick={() => save(postJson("/api/portal/addresses", { id: x.id, remove: true }), t("saved"))}>{t("remove")}</button>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 rounded-xl ring-1 ring-brown/10 p-3 sm:grid-cols-[160px_1fr]">
          <input className="input" placeholder={t("addressLabel")} value={addr.label} onChange={(e) => setAddr({ ...addr, label: e.target.value })} />
          <input className="input" placeholder={t("field_address")} value={addr.address} onChange={(e) => setAddr({ ...addr, address: e.target.value })} />
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button className="btn-secondary btn-sm" onClick={() => locate((lat, lng) => setAddr({ ...addr, lat, lng }))}>📍 {t("useMyLocation")}</button>
            {addr.lat && <span className="text-xs text-brown/60">{addr.lat}, {addr.lng}</span>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addr.is_default} onChange={(e) => setAddr({ ...addr, is_default: e.target.checked })} /> {t("default")}</label>
            <button className="btn-primary btn-sm ml-auto" disabled={busy || !addr.address.trim()}
              onClick={async () => { if (await save(postJson("/api/portal/addresses", addr), t("saved"))) setAddr({ label: "", address: "", lat: "", lng: "", is_default: false }); }}>+ {t("addAddress")}</button>
          </div>
        </div>
      </section>

      <section id="pay" className="card grid gap-3">
        <h2 className="text-lg font-bold">{t("uploadProof")}</h2>
        <p className="text-sm text-brown/70">{t("uploadProofHelp")}</p>
        <form key={formKey} className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const ok = await save(api("/api/portal/proofs", { method: "POST", body: fd }), t("proofSent"));
          if (ok) setFormKey((k) => k + 1);
        }}>
          <label><span className="label">{t("forOrder")}</span>
            <select name="order_id" className="input" defaultValue={payOrderId ?? ""}>
              <option value="">{t("noSpecificOrder")}</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.order_no} · {peso(o.total)}</option>)}
            </select></label>
          <label><span className="label">{t("amountPaid")}</span><input name="amount" type="number" step="0.01" min="0.01" required className="input" /></label>
          <label><span className="label">{t("paidVia")}</span>
            <select name="method" className="input" required>
              {["bank_transfer", "gcash", "maya", "cheque"].map((m) => <option key={m} value={m}>{tb(m)}</option>)}
            </select></label>
          <label><span className="label">{t("reference")}</span><input name="reference" className="input" /></label>
          <div className="sm:col-span-2"><PhotoInput name="file" required label={t("proofPhoto")} accept="image/*,application/pdf" /></div>
          <div className="flex justify-end sm:col-span-2"><button className="btn-primary" disabled={busy}>{t("sendProof")}</button></div>
        </form>
        {a.proofs.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {a.proofs.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-brown/5 py-1">
              <span>{date(p.created_at, locale)} · {tb(p.method)} · <b>{peso(p.amount)}</b></span>
              <span className="flex items-center gap-2">{p.review_note && <span className="text-xs text-brown/60">{p.review_note}</span>}<StatusBadge kind="generic" status={p.status} /></span>
            </li>)}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-2 text-lg font-bold">{t("paymentHistory")}</h2>
        {a.payments.length === 0 ? <p className="text-sm text-brown/60">{t("noPayments")}</p> : (
          <ul className="grid gap-1 text-sm">
            {a.payments.map((p) => <li key={p.id} className="flex justify-between border-b border-brown/5 py-1"><span>{date(p.paid_at, locale)} · {p.order_no} · {tb(p.method === "adjustment" ? "cash" : p.method)}</span><b>{peso(p.amount)}</b></li>)}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-2 text-lg font-bold">{t("companyUsers")}</h2>
        <ul className="grid gap-1 text-sm">{a.users.map((u) => <li key={u.id}>{u.full_name} · {u.email}{u.is_primary ? ` · ${t("primary")}` : ""}</li>)}</ul>
        <p className="mt-2 text-xs text-brown/60">{t("addUserHelp")}</p>
      </section>

      <section className="card grid gap-3">
        <h2 className="text-lg font-bold">{t("privacyTitle")}</h2>
        <p className="text-sm text-brown/70">{t("privacyHelp")}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => save(postJson("/api/portal/privacy", { kind: "copy" }), t("requestSent"))}>{t("requestCopy")}</button>
          <a className="btn-ghost" href="/portal/privacy">{t("readPolicy")}</a>
        </div>
        {a.data_requests.length > 0 && <ul className="text-sm">{a.data_requests.map((r, i) => <li key={i}>{date(r.created_at, locale)} · {t(`request_${r.kind}`)} · <StatusBadge kind="generic" status={r.status} /></li>)}</ul>}
        <div className="rounded-xl border border-st-problem/30 p-3">
          <h3 className="font-bold text-st-problem">{t("deleteAccount")}</h3>
          <p className="text-sm text-brown/70">{t("deleteAccountHelp")}</p>
          {deletionPending ? <p className="mt-2 font-semibold">{t("deletionPending")}</p> : (
            <div className="mt-2 flex flex-wrap gap-2">
              <input className="input max-w-48" placeholder="DELETE" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
              <button className="btn-danger" disabled={busy || confirmDelete.trim().toUpperCase() !== "DELETE"}
                onClick={() => save(postJson("/api/portal/privacy", { kind: "deletion", confirm: confirmDelete }), t("deletionRequested"))}>{t("deleteAccount")}</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
