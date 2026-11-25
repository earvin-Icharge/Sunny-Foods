"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { saveAgent } from "./actions";

type A = Record<string, unknown> | null;

export function AgentForm({ agent, roles, teams, showRates }: {
  agent: A; roles: { key: string; name: string }[]; teams: { id: string; name: string }[]; showRates: boolean;
}) {
  const t = useTranslations("agents");
  const tc = useTranslations("common");
  const router = useRouter();
  const { run, pending } = useAction();
  const [created, setCreated] = useState<{ email: string | null; password: string | null; id: string } | null>(null);
  const v = (k: string) => (agent?.[k] ?? "") as string;
  if (created?.password) {
    return (
      <div className="card grid gap-3">
        <h2 className="text-xl font-bold">{t("loginCreated")}</h2>
        <p>{t("loginCreatedHelp")}</p>
        <div className="rounded-xl bg-cream p-4 font-mono">{created.email}<br />{created.password}</div>
        <button className="btn-primary" onClick={() => router.push(`/staff/agents/${created.id}`)}>{t("openAgent")}</button>
      </div>
    );
  }
  return (
    <form className="card grid gap-4 sm:grid-cols-2" action={(fd) => run(() => saveAgent((agent?.id as string) ?? null, fd), {
      undo: Boolean(agent), onDone: (d) => { if (!agent) { if (d.password) setCreated(d); else router.push(`/staff/agents/${d.id}`); } },
    })}>
      <Field label={t("name")}><Input name="name" required defaultValue={v("name")} /></Field>
      <Field label={t("type")}>
        <Select name="type" defaultValue={v("type") || "agent"}>
          <option value="agent">{t("type_agent")}</option><option value="broker">{t("type_broker")}</option>
        </Select>
      </Field>
      <Field label={t("role")} hint={t("roleHint")}>
        <Select name="role_key" defaultValue={v("role_key") || "agent"}>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </Select>
      </Field>
      <Field label={t("referralCode")} hint={t("referralHint")}><Input name="referral_code" defaultValue={v("referral_code")} placeholder="AG-JUAN" /></Field>
      <Field label={tc("phone")}><Input name="phone" type="tel" defaultValue={v("phone")} /></Field>
      <Field label={tc("email")}><Input name="email" type="email" defaultValue={v("email")} /></Field>
      <Field label={t("payoutMethod")}>
        <Select name="payout_method" defaultValue={v("payout_method")}>
          <option value="">—</option><option value="gcash">GCash</option><option value="bank">{t("bank")}</option>
        </Select>
      </Field>
      <Field label={t("payoutName")} hint={t("payoutNameHint")}><Input name="payout_name" defaultValue={v("payout_name")} /></Field>
      {showRates && <>
        <Field label={t("defaultRateKind")}>
          <Select name="default_rate_kind" defaultValue={v("default_rate_kind") || "percent"}>
            <option value="percent">{t("percent")}</option><option value="fixed">{t("fixedPerOrder")}</option>
          </Select>
        </Field>
        <Field label={t("defaultRate")}><Input name="default_rate" type="number" step="0.01" min="0" defaultValue={v("default_rate") || "0"} /></Field>
      </>}
      <Field label={t("team")}>
        <Select name="team_id" defaultValue={v("team_id")}>
          <option value="">—</option>
          {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      </Field>
      {agent ? (
        <>
          <Field label={tc("status")}>
            <Select name="status" defaultValue={v("status")}>
              <option value="active">{t("status_active")}</option><option value="inactive">{t("status_inactive")}</option>
              {v("status") === "resigned" && <option value="resigned">{t("status_resigned")}</option>}
            </Select>
          </Field>
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="referral_active" className="h-5 w-5" defaultChecked={Boolean(agent.referral_active)} /> {t("referralActive")}</label>
        </>
      ) : (
        <label className="flex items-center gap-2 font-semibold sm:col-span-2"><input type="checkbox" name="create_login" className="h-5 w-5" defaultChecked /> {t("createLogin")}</label>
      )}
      <div className="flex justify-end sm:col-span-2"><button className="btn-primary" disabled={pending}>{pending ? "…" : tc("save")}</button></div>
    </form>
  );
}
