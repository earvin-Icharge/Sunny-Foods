"use client";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { LEVELS } from "@/lib/perms";
import { resetOverrides, sendPasswordReset, setFieldOverride, setModuleOverride, setUserActive, updateUser } from "../actions";
import { startViewAs } from "../../master-control/actions";

export function UserProfileForm({ id, profile, roles, teams, canEdit }: {
  id: string; canEdit: boolean; profile: { full_name: string; phone: string; role_key: string; team_id: string };
  roles: { key: string; name: string }[]; teams: { id: string; name: string }[];
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  return (
    <form className="card grid gap-3 sm:grid-cols-2" action={(fd) => run(() => updateUser(id, fd), { undo: true })}>
      <fieldset disabled={!canEdit} className="contents">
        <Field label={t("name")}><Input name="full_name" defaultValue={profile.full_name} /></Field>
        <Field label={tc("phone")}><Input name="phone" defaultValue={profile.phone} /></Field>
        <Field label={t("role")}><Select name="role_key" defaultValue={profile.role_key}>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select></Field>
        <Field label={t("team")}><Select name="team_id" defaultValue={profile.team_id}><option value="">—</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      </fieldset>
      {canEdit && <div className="flex justify-end sm:col-span-2"><button className="btn-primary" disabled={pending}>{tc("save")}</button></div>}
    </form>
  );
}

export function UserButtons({ id, active, canViewAs }: { id: string; active: boolean; canViewAs: boolean }) {
  const t = useTranslations("settings");
  const { run, pending } = useAction();
  return (
    <>
      {canViewAs && <form action={startViewAs.bind(null, id)}><button className="btn-secondary btn-sm">👁 {t("viewAs")}</button></form>}
      <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => sendPasswordReset(id), { success: t("resetSent"), refresh: false })}>{t("sendReset")}</button>
      <button className={`btn-sm ${active ? "btn-secondary text-st-problem" : "btn-primary"}`} disabled={pending}
        onClick={() => { if (!active || confirm(t("deactivateConfirm"))) run(() => setUserActive(id, !active)); }}>{active ? t("deactivate") : t("reactivate")}</button>
    </>
  );
}

const AGENT_CHOICES: Record<string, string[]> = {
  ag_products: ["all", "categories"], ag_categories: [], ag_prices: ["hidden", "regular", "customer"], ag_stock: ["hidden", "badge", "exact"],
  ag_customer: ["name", "contact", "address", "balance"], ag_orders: ["status", "full"], ag_commission: ["amount", "breakdown"],
  ag_leaderboard: ["hidden", "own", "full"], ag_act_order: ["on", "off"], ag_act_refer: ["on", "off"], ag_act_voucher: ["on", "off"], ag_act_reports: ["on", "off"],
};

/** Per-person overrides: highlighted when different from the role; "Reset to role default". */
export function OverridesEditor({ userId, modules, fields, roleMod, roleFld, ovMod, ovFld, agentArea }: {
  userId: string; modules: string[]; fields: string[]; agentArea: boolean;
  roleMod: Record<string, { level: number; scope: string }>; roleFld: Record<string, string>;
  ovMod: Record<string, { level: number | null; scope: string | null }>; ovFld: Record<string, string>;
}) {
  const t = useTranslations("masterControl");
  const ts = useTranslations("settings");
  const { run, pending } = useAction();
  const count = Object.keys(ovMod).length + Object.keys(ovFld).length;
  return (
    <div className="grid gap-4">
      <div className="card table-wrap p-0">
        <table className="table">
          <thead><tr><th>{t("module")}</th><th>{ts("roleDefault")}</th><th>{ts("thisPerson")}</th><th></th></tr></thead>
          <tbody>{modules.map((m) => {
            const base = roleMod[m] ?? { level: 0, scope: "own" };
            const ov = ovMod[m];
            return (
              <tr key={m} className={ov ? "bg-gold/15" : ""}>
                <td className="font-semibold">{t(`module_${m}`)}</td>
                <td className="text-brown/70">{t(`level_${LEVELS[base.level]}`)}{base.level > 0 ? ` · ${t(`scope_${base.scope}`)}` : ""}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    <select className="min-h-10 rounded-lg border border-brown/20 px-2 text-sm" disabled={pending} value={ov?.level ?? ""}
                      onChange={(e) => run(() => setModuleOverride(userId, m, e.target.value === "" ? null : Number(e.target.value), ov?.scope ?? (e.target.value === "" ? null : base.scope)))}>
                      <option value="">{ts("useRole")}</option>
                      {LEVELS.map((l, i) => <option key={l} value={i}>{t(`level_${l}`)}</option>)}
                    </select>
                    {ov && <select className="min-h-10 rounded-lg border border-brown/20 px-2 text-sm" disabled={pending} value={ov.scope ?? ""}
                      onChange={(e) => run(() => setModuleOverride(userId, m, ov.level, e.target.value || null))}>
                      <option value="">{ts("useRole")}</option>
                      {["own", "team", "all"].map((s) => <option key={s} value={s}>{t(`scope_${s}`)}</option>)}
                    </select>}
                  </div>
                </td>
                <td>{ov && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setModuleOverride(userId, m, null, null))}>↺</button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {fields.length > 0 && (
        <div className="card table-wrap p-0">
          <table className="table">
            <thead><tr><th>{t("field")}</th><th>{ts("roleDefault")}</th><th>{ts("thisPerson")}</th><th></th></tr></thead>
            <tbody>{fields.filter((f) => f !== "ag_categories").map((f) => {
              const base = roleFld[f] ?? (agentArea ? (AGENT_CHOICES[f]?.[0] ?? "off") : "off");
              const ov = ovFld[f];
              const choices = agentArea ? AGENT_CHOICES[f] : ["on", "off"];
              const label = (v: string) => (agentArea ? t(`choice_${f}_${v}`) : t(v));
              return (
                <tr key={f} className={ov !== undefined ? "bg-gold/15" : ""}>
                  <td className="font-semibold">{t(`field_${f}`)}</td>
                  <td className="text-brown/70">{label(base)}</td>
                  <td>
                    <select className="min-h-10 rounded-lg border border-brown/20 px-2 text-sm" disabled={pending} value={ov ?? ""}
                      onChange={(e) => run(() => setFieldOverride(userId, f, e.target.value || null))}>
                      <option value="">{ts("useRole")}</option>
                      {choices.map((c) => <option key={c} value={c}>{label(c)}</option>)}
                    </select>
                  </td>
                  <td>{ov !== undefined && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setFieldOverride(userId, f, null))}>↺</button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {count > 0 && <div><button className="btn-secondary" disabled={pending} onClick={() => run(() => resetOverrides(userId))}>{ts("resetToRole", { n: count })}</button></div>}
    </div>
  );
}
