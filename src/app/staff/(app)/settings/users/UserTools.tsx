"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { createStaffUser, removeTeam, saveTeam } from "./actions";

export function CreateUserForm({ roles, teams }: { roles: { key: string; name: string }[]; teams: { id: string; name: string }[] }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [cred, setCred] = useState<{ email: string; password: string } | null>(null);
  if (cred) return (
    <div className="card grid gap-2">
      <b>{t("accountCreated")}</b>
      <p className="text-sm">{t("tempPasswordHelp")}</p>
      <div className="rounded-xl bg-cream p-3 font-mono">{cred.email}<br />{cred.password}</div>
      <button className="btn-secondary" onClick={() => { setCred(null); setOpen(false); }}>{tc("close")}</button>
    </div>
  );
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ {t("addStaff")}</button>;
  return (
    <form className="card grid gap-3 sm:grid-cols-2" action={(fd) => run(() => createStaffUser(fd), { onDone: (d) => setCred(d) })}>
      <Field label={t("name")}><Input name="full_name" required /></Field>
      <Field label={tc("email")}><Input name="email" type="email" required /></Field>
      <Field label={tc("phone")}><Input name="phone" type="tel" /></Field>
      <Field label={t("role")}><Select name="role_key" required defaultValue="office">{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select></Field>
      <Field label={t("team")}><Select name="team_id" defaultValue=""><option value="">—</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      <div className="flex items-end justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{tc("cancel")}</button>
        <button className="btn-primary" disabled={pending}>{t("createAccount")}</button>
      </div>
    </form>
  );
}

export function Teams({ teams, canEdit }: { teams: { id: string; name: string; members: number }[]; canEdit: boolean }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [name, setName] = useState("");
  return (
    <section className="card mt-6">
      <h2 className="mb-1 text-lg font-bold">{t("teams")}</h2>
      <p className="mb-3 text-sm text-brown/70">{t("teamsHelp")}</p>
      <ul className="grid gap-1">
        {teams.map((x) => (
          <li key={x.id} className="flex items-center justify-between rounded-xl bg-cream-light px-3 py-2">
            <span><b>{x.name}</b> · {t("members", { n: x.members })}</span>
            {canEdit && <button className="btn-ghost btn-sm text-st-problem" disabled={pending} onClick={() => run(() => removeTeam(x.id))}>{tc("remove")}</button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-3 flex gap-2">
          <input className="input" placeholder={t("teamName")} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-secondary" disabled={!name || pending} onClick={() => run(() => saveTeam(null, name), { onDone: () => setName("") })}>+ {tc("add")}</button>
        </div>
      )}
    </section>
  );
}
