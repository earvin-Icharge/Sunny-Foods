"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAction } from "@/components/ui/useAction";
import { peso } from "@/lib/format";
import {
  addAdjustment, cancelCommissions, createAgentLogin, linkCustomer, resignAgent, saveTarget, transferCustomer,
} from "../actions";

type Opt = { id: string; name: string };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

export function CreateLoginButton({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { run, pending } = useAction();
  const [cred, setCred] = useState<{ email: string; password: string } | null>(null);
  if (cred) return <div className="rounded-xl bg-cream p-3 font-mono text-sm">{t("loginCreatedHelp")}<br />{cred.email}<br />{cred.password}</div>;
  return <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => createAgentLogin(agentId), { onDone: setCred, refresh: false })}>{t("createLogin")}</button>;
}

export function LinkCustomerForm({ agentId, customers }: { agentId: string; customers: Opt[] }) {
  const t = useTranslations("agents");
  const { run, pending } = useAction();
  const [c, setC] = useState("");
  const [start, setStart] = useState(today());
  return (
    <div className="card">
      <h2 className="mb-1 font-bold">{t("linkCustomer")}</h2>
      <p className="mb-3 text-sm text-brown/70">{t("linkCustomerHelp")}</p>
      <div className="flex flex-wrap gap-2">
        <select className="input flex-1" value={c} onChange={(e) => setC(e.target.value)}>
          <option value="">{t("chooseCustomer")}</option>
          {customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <input className="input w-44" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <button className="btn-primary" disabled={!c || pending} onClick={() => run(() => linkCustomer(agentId, c, start), { onDone: () => setC("") })}>{t("link")}</button>
      </div>
    </div>
  );
}

export function TransferForm({ fromAgentId, customers, agents }: { fromAgentId: string; customers: Opt[]; agents: Opt[] }) {
  const t = useTranslations("agents");
  const { run, pending } = useAction();
  const [customer, setCustomer] = useState("");
  const [split, setSplit] = useState(false);
  const name = customers.find((c) => c.id === customer)?.name ?? "";
  return (
    <form className="card grid gap-3 sm:grid-cols-2" action={(fd) => run(() => transferCustomer(fd))}>
      <h2 className="font-bold sm:col-span-2">{t("transferTitle")}</h2>
      <p className="text-sm text-brown/70 sm:col-span-2">{t("transferHelp")}</p>
      <input type="hidden" name="from_agent_id" value={fromAgentId} />
      <Field label={t("customer")}>
        <Select name="customer_id" required value={customer} onChange={(e) => setCustomer(e.target.value)}>
          <option value="">{t("chooseCustomer")}</option>
          {customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      </Field>
      <Field label={t("toAgent")}>
        <Select name="to_agent_id" required defaultValue="">
          <option value="">{t("chooseAgent")}</option>
          {agents.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      </Field>
      <Field label={t("scope")}>
        <Select name="scope" defaultValue="future">
          <option value="future">{t("scope_future")}</option><option value="future_unpaid">{t("scope_future_unpaid")}</option>
        </Select>
      </Field>
      <Field label={t("effectiveDate")}><Input name="effective_date" type="date" defaultValue={today()} required /></Field>
      <label className="flex items-center gap-2 font-semibold sm:col-span-2"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="h-5 w-5" /> {t("splitForPeriod")}</label>
      {split && <>
        <Field label={t("oldAgentShare")}><Input name="split_from_pct" type="number" min="1" max="99" defaultValue="40" /></Field>
        <Field label={t("splitUntil")}><Input name="split_until" type="date" required /></Field>
      </>}
      <Field label={t("reason")} className="sm:col-span-2"><Input name="reason" required /></Field>
      <Field label={t("typeToConfirm", { name: name || t("customer") })} className="sm:col-span-2"><Input name="confirm_text" required placeholder={name} /></Field>
      <div className="flex justify-end sm:col-span-2"><button className="btn-danger" disabled={pending || !customer}>{t("transfer")}</button></div>
    </form>
  );
}

type Line = { id: string; orderNo: string; customer: string; date: string; base: number; rate: number; share: number; amount: number; status: string; voidReason: string | null; transferred: boolean };

export function CancelCommissionsForm({ agentId, agentName, lines, customers, showRates }: { agentId: string; agentName: string; lines: Line[]; customers: Opt[]; showRates: boolean }) {
  const t = useTranslations("agents");
  const { run, pending } = useAction();
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [allFuture, setAllFuture] = useState(false);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const cancellable = (s: string) => ["pending", "earned", "approved"].includes(s);
  return (
    <div className="grid gap-3">
      <div className="card table-wrap p-0">
        <table className="table">
          <thead><tr><th></th><th>{t("order")}</th><th>{t("customer")}</th>
            {showRates && <><th className="text-right">{t("base")}</th><th className="text-right">{t("rate")}</th></>}
            <th className="text-right">{t("amount")}</th><th>{t("status")}</th></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.id}>
              <td>{cancellable(l.status) && <input type="checkbox" className="h-5 w-5" checked={sel.includes(l.id)}
                onChange={(e) => setSel((s) => e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id))} />}</td>
              <td className="font-semibold">{l.orderNo}<div className="text-xs font-normal text-brown/60">{l.date}</div></td>
              <td>{l.customer}{l.transferred && <div className="text-xs text-brown/60">{t("transferredIn")}</div>}</td>
              {showRates && <><td className="text-right">{peso(l.base)}</td><td className="text-right">{l.rate}%{l.share < 100 ? ` × ${l.share}%` : ""}</td></>}
              <td className="text-right font-semibold">{peso(l.amount)}</td>
              <td><StatusBadge kind="generic" status={l.status} />{l.voidReason && <div className="text-xs text-brown/60">{l.voidReason}</div>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      {!open ? (
        <div><button className="btn-secondary text-st-problem" onClick={() => setOpen(true)}>{t("cancelCommissions")}</button></div>
      ) : (
        <div className="card grid gap-3">
          <h2 className="font-bold">{t("cancelCommissions")}</h2>
          <p className="text-sm text-brown/70">{t("cancelHelp", { count: sel.length })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="h-5 w-5" checked={allFuture} onChange={(e) => setAllFuture(e.target.checked)} /> {t("cancelAllFuture")}</label>
            {allFuture && <select className="input max-w-xs" value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">{t("chooseCustomer")}</option>{customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>}
          </div>
          <input className="input" placeholder={t("reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <input className="input" placeholder={agentName} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <p className="text-xs text-brown/60">{t("typeToConfirm", { name: agentName })}</p>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>{t("close")}</button>
            <button className="btn-danger" disabled={pending || !reason || confirm.trim() !== agentName}
              onClick={() => run(() => cancelCommissions(agentId, sel, allFuture ? customer || null : null, allFuture, reason, confirm), { onDone: () => { setOpen(false); setSel([]); } })}>
              {t("cancelCommissions")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdjustmentForm({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { run, pending } = useAction();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <input className="input w-36" type="number" step="0.01" placeholder="±₱" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input className="input flex-1" placeholder={t("reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-secondary" disabled={pending} onClick={() => run(() => addAdjustment(agentId, Number(amount), reason), { onDone: () => { setAmount(""); setReason(""); } })}>{t("addAdjustment")}</button>
    </div>
  );
}

export function TargetForm({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { run, pending } = useAction();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [amount, setAmount] = useState("");
  return (
    <div className="flex flex-wrap gap-2">
      <input className="input w-44" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      <input className="input w-44" type="number" min="0" step="100" placeholder="₱" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button className="btn-secondary" disabled={pending || !amount} onClick={() => run(() => saveTarget(agentId, month, Number(amount)))}>{t("setTarget")}</button>
    </div>
  );
}

export function ResignForm({ agentId, agentName }: { agentId: string; agentName: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today());
  const [confirm, setConfirm] = useState("");
  return (
    <>
      <button className="btn-secondary btn-sm text-st-problem" onClick={() => setOpen(true)}>{t("resign")}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="card grid w-full max-w-md gap-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{t("resignTitle")}</h3>
            <p className="text-sm text-brown/70">{t("resignHelp")}</p>
            <Field label={t("lastDay")}><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
            <Field label={t("typeToConfirm", { name: agentName })}><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={agentName} /></Field>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>{t("close")}</button>
              <button className="btn-danger" disabled={pending || confirm.trim() !== agentName}
                onClick={() => run(() => resignAgent(agentId, day, confirm), { onDone: (sid) => router.push(`/staff/agents/${agentId}/settlement/${sid}`) })}>{t("resign")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
