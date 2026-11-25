"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { useToast } from "@/components/ui/Toast";
import { LEVELS } from "@/lib/perms";
import { copyRole, renameRole, rollback, saveApprovalRule, saveField, savePermission, setRoleActive, startViewAs, startViewAsRole } from "./actions";

type Role = { key: string; name: string; area: string; builtin: boolean; agentRole: boolean; active: boolean; basedOn: string | null; people: number };
const SCOPES = ["own", "team", "all"];

/** Permission matrix: rows = modules, columns = roles (one table per area). Saves each change at once. */
export function MatrixEditor({ roles, modules, perms }: { roles: Role[]; modules: string[]; perms: Record<string, { level: number; scope: string }> }) {
  const t = useTranslations("masterControl");
  const { run, pending } = useAction();
  const [state, setState] = useState(perms);
  const areas = ["internal", "portal", "agent"];
  function change(role: string, module: string, level: number, scope: string) {
    setState((s) => ({ ...s, [`${role}:${module}`]: { level, scope } }));
    run(() => savePermission(role, module, level, scope), { refresh: false });
  }
  return (
    <div className="grid gap-6">
      <p className="text-sm text-brown/70">{t("matrixHelp")}</p>
      {areas.map((area) => {
        const cols = roles.filter((r) => r.area === area);
        if (!cols.length) return null;
        return (
          <div key={area} className="card table-wrap p-0">
            <h2 className="px-4 pt-4 text-lg font-bold">{t(`area_${area}`)}</h2>
            <table className="table">
              <thead><tr><th>{t("module")}</th>{cols.map((r) => <th key={r.key} className="min-w-40">{r.name}</th>)}</tr></thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m}>
                    <td className="font-semibold">{t(`module_${m}`)}</td>
                    {cols.map((r) => {
                      if (r.key === "owner") return <td key={r.key} className="text-brown/60">{t("level_approve")} · {t("scope_all")}</td>;
                      const cur = state[`${r.key}:${m}`] ?? { level: 0, scope: "all" };
                      return (
                        <td key={r.key}>
                          <div className="grid gap-1">
                            <select className={`min-h-10 rounded-lg border border-brown/20 px-2 text-sm ${cur.level > 0 ? "bg-st-ok/10 font-semibold" : ""}`} disabled={pending}
                              value={cur.level} onChange={(e) => change(r.key, m, Number(e.target.value), cur.scope)}>
                              {LEVELS.map((l, i) => <option key={l} value={i}>{t(`level_${l}`)}</option>)}
                            </select>
                            {cur.level > 0 && (
                              <select className="min-h-9 rounded-lg border border-brown/10 px-2 text-xs" disabled={pending}
                                value={cur.scope} onChange={(e) => change(r.key, m, cur.level, e.target.value)}>
                                {SCOPES.map((s) => <option key={s} value={s}>{t(`scope_${s}`)}</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/** Sensitive-field switches per role (off = hidden everywhere, also in exports and API). */
export function FieldsEditor({ roles, fieldNames, values }: { roles: Role[]; fieldNames: string[]; values: Record<string, string> }) {
  const t = useTranslations("masterControl");
  const { run, pending } = useAction();
  const [state, setState] = useState(values);
  return (
    <div className="card table-wrap p-0">
      <p className="px-4 pt-4 text-sm text-brown/70">{t("fieldsHelp")}</p>
      <table className="table">
        <thead><tr><th>{t("field")}</th>{roles.map((r) => <th key={r.key}>{r.name}</th>)}</tr></thead>
        <tbody>{fieldNames.map((f) => (
          <tr key={f}>
            <td className="font-semibold">{t(`field_${f}`)}</td>
            {roles.map((r) => {
              if (r.key === "owner") return <td key={r.key}>✅</td>;
              const on = state[`${r.key}:${f}`] === "on";
              return (
                <td key={r.key}>
                  <button disabled={pending} onClick={() => {
                    setState((s) => ({ ...s, [`${r.key}:${f}`]: on ? "off" : "on" }));
                    run(() => saveField(r.key, f, on ? "off" : "on"), { refresh: false });
                  }} className={`min-h-10 min-w-16 rounded-full px-3 text-sm font-bold ${on ? "bg-st-ok text-white" : "bg-brown/10 text-brown/60"}`}>
                    {on ? t("on") : t("off")}
                  </button>
                </td>
              );
            })}
          </tr>))}</tbody>
      </table>
    </div>
  );
}

const AGENT_CHOICES: Record<string, string[]> = {
  ag_products: ["all", "categories"], ag_prices: ["hidden", "regular", "customer"], ag_stock: ["hidden", "badge", "exact"],
  ag_customer: ["name", "contact", "address", "balance"], ag_orders: ["status", "full"], ag_commission: ["amount", "breakdown"],
  ag_leaderboard: ["hidden", "own", "full"], ag_act_order: ["on", "off"], ag_act_refer: ["on", "off"], ag_act_voucher: ["on", "off"], ag_act_reports: ["on", "off"],
};

/** Agent & broker visibility panel (Spec 3a table). */
export function AgentPanel({ roles, fieldNames, values, categories }: { roles: Role[]; fieldNames: string[]; values: Record<string, string>; categories: { id: string; name: string }[] }) {
  const t = useTranslations("masterControl");
  const { run, pending } = useAction();
  const [state, setState] = useState(values);
  const save = (role: string, f: string, v: string) => { setState((s) => ({ ...s, [`${role}:${f}`]: v })); run(() => saveField(role, f, v), { refresh: false }); };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {roles.map((r) => {
        let cats: string[] = [];
        try { cats = JSON.parse(state[`${r.key}:ag_categories`] ?? "[]"); } catch {}
        return (
          <div key={r.key} className="card grid gap-3">
            <h2 className="text-lg font-bold">{r.name}</h2>
            {fieldNames.filter((f) => f !== "ag_categories").map((f) => (
              <label key={f} className="grid gap-1 sm:grid-cols-2 sm:items-center">
                <span className="text-sm font-semibold">{t(`field_${f}`)}</span>
                <select className="input" disabled={pending} value={state[`${r.key}:${f}`] ?? AGENT_CHOICES[f][0]} onChange={(e) => save(r.key, f, e.target.value)}>
                  {AGENT_CHOICES[f].map((c) => <option key={c} value={c}>{t(`choice_${f}_${c}`)}</option>)}
                </select>
              </label>
            ))}
            {(state[`${r.key}:ag_products`] ?? "all") === "categories" && (
              <div>
                <span className="text-sm font-semibold">{t("field_ag_categories")}</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {categories.map((c) => {
                    const on = cats.includes(c.id);
                    return <button key={c.id} disabled={pending} onClick={() => save(r.key, "ag_categories", JSON.stringify(on ? cats.filter((x) => x !== c.id) : [...cats, c.id]))}
                      className={`rounded-full px-3 py-2 text-sm font-semibold ${on ? "bg-sunny text-white" : "bg-cream"}`}>{c.name}</button>;
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Built-in and custom roles: copy, rename, deactivate. */
export function RolesEditor({ roles }: { roles: Role[] }) {
  const t = useTranslations("masterControl");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [from, setFrom] = useState("office");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});
  return (
    <div className="grid gap-4">
      <div className="card table-wrap p-0">
        <table className="table">
          <thead><tr><th>{t("roleName")}</th><th>{t("code")}</th><th>{t("areaCol")}</th><th>{t("people")}</th><th></th></tr></thead>
          <tbody>{roles.map((r) => (
            <tr key={r.key} className={r.active ? "" : "opacity-50"}>
              <td>
                <div className="flex gap-2">
                  <input className="input min-h-10" value={editing[r.key] ?? r.name} onChange={(e) => setEditing((s) => ({ ...s, [r.key]: e.target.value }))} />
                  {editing[r.key] !== undefined && editing[r.key] !== r.name &&
                    <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => renameRole(r.key, editing[r.key]))}>{tc("save")}</button>}
                </div>
                {r.basedOn && <div className="text-xs text-brown/60">{t("copiedFrom", { role: r.basedOn })}</div>}
              </td>
              <td><code>{r.key}</code>{r.builtin && <span className="ml-1 text-xs text-brown/60">({t("builtin")})</span>}</td>
              <td>{t(`area_${r.area}`)}</td>
              <td>{r.people}</td>
              <td>{!r.builtin && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setRoleActive(r.key, !r.active))}>{r.active ? t("deactivate") : t("activate")}</button>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="card grid gap-3 sm:grid-cols-4">
        <h2 className="font-bold sm:col-span-4">{t("newRole")}</h2>
        <p className="text-sm text-brown/70 sm:col-span-4">{t("newRoleHelp")}</p>
        <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
          {roles.filter((r) => r.key !== "owner").map((r) => <option key={r.key} value={r.key}>{t("copyOf", { role: r.name })}</option>)}
        </select>
        <input className="input" placeholder={t("roleNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder={t("codePlaceholder")} value={key} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
        <button className="btn-primary" disabled={pending || !key || !name} onClick={() => run(() => copyRole(from, key, name), { onDone: () => { setKey(""); setName(""); } })}>+ {t("createRole")}</button>
      </div>
    </div>
  );
}

export function ApprovalRulesEditor({ rules }: { rules: { key: string; label: string; enabled: boolean; threshold: number | null }[] }) {
  const t = useTranslations("masterControl");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const withThreshold = ["manual_discount", "stock_adjustment"];
  return (
    <div className="card grid gap-3">
      <p className="text-sm text-brown/70">{t("approvalsHelp")}</p>
      {rules.map((r) => (
        <form key={r.key} className="flex flex-wrap items-center gap-3 rounded-xl bg-cream-light px-3 py-2"
          action={(fd) => run(() => saveApprovalRule(r.key, fd.get("enabled") === "on", fd.get("threshold") ? Number(fd.get("threshold")) : null))}>
          <label className="flex flex-1 items-center gap-2 font-semibold"><input type="checkbox" name="enabled" defaultChecked={r.enabled} className="h-5 w-5" /> {t(`rule_${r.key}`)}</label>
          {withThreshold.includes(r.key) && <label className="flex items-center gap-2 text-sm">X = <input className="input w-24" name="threshold" type="number" min="0" defaultValue={r.threshold ?? ""} /></label>}
          <button className="btn-secondary btn-sm" disabled={pending}>{tc("save")}</button>
        </form>
      ))}
    </div>
  );
}

export function ViewAsPanel({ roles, people }: { roles: Role[]; people: { id: string; name: string; role: string; area: string }[] }) {
  const t = useTranslations("masterControl");
  const toast = useToast();
  const [person, setPerson] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <p className="text-sm text-brown/70 sm:col-span-2">{t("viewAsHelp")}</p>
      <div className="card grid gap-3">
        <h2 className="font-bold">{t("viewAsRole")}</h2>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">—</option>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
        <button className="btn-primary" disabled={!role || busy} onClick={async () => {
          setBusy(true);
          const r = await startViewAsRole(role).catch((e) => { if (String(e?.digest ?? "").startsWith("NEXT_REDIRECT")) throw e; return { ok: false as const, error: String(e?.message ?? e) }; });
          setBusy(false);
          if (r && !r.ok) toast.show(r.error, "error");
        }}>{t("preview")}</button>
      </div>
      <form className="card grid gap-3" action={startViewAs.bind(null, person)}>
        <h2 className="font-bold">{t("viewAsPerson")}</h2>
        <select className="input" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
        </select>
        <button className="btn-primary" disabled={!person}>{t("preview")}</button>
      </form>
    </div>
  );
}

export function RollbackButton({ auditId }: { auditId: number }) {
  const t = useTranslations("masterControl");
  const { run, pending } = useAction();
  return <button className="btn-secondary btn-sm" disabled={pending} onClick={() => { if (confirm(t("rollbackConfirm"))) run(() => rollback(auditId)); }}>{t("rollback")}</button>;
}
