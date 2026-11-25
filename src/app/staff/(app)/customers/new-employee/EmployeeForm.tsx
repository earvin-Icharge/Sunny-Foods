"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/Field";
import { useAction } from "@/components/ui/useAction";
import { createEmployeeBuyer } from "../actions";

export function EmployeeForm({ staff }: { staff: { id: string; name: string; email: string }[] }) {
  const t = useTranslations("customers");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [sid, setSid] = useState("");
  const [done, setDone] = useState<{ customerId: string; email: string; password: string } | null>(null);
  if (done) {
    return (
      <div className="card max-w-xl">
        <b>{t("loginCreated")}</b>
        <p className="mt-2">{tc("email")}: <code>{done.email}</code><br />{t("tempPassword")}: <code className="text-lg font-bold">{done.password}</code></p>
        <p className="mt-1 text-sm text-brown/70">{t("tempPasswordHelp")}</p>
        <Link className="btn-primary mt-4" href={`/staff/customers/${done.customerId}`}>{t("openAccount")}</Link>
      </div>
    );
  }
  return (
    <form className="card grid max-w-xl gap-4" action={(fd) => run(() => createEmployeeBuyer(fd), { onDone: (d) => setDone(d) })}>
      <Field label={t("staffMember")}>
        <Select name="staff_profile_id" required value={sid} onChange={(e) => setSid(e.target.value)}>
          <option value="">{t("chooseStaff")}</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label={t("portalEmail")} hint={t("portalEmailHint")}>
        <Input name="email" type="email" required key={sid} defaultValue={""} />
      </Field>
      <Field label={t("pesosPerMonth")} hint={tc("optional")}><Input name="monthly_amount" type="number" min="1" step="0.01" placeholder="5000" /></Field>
      <button className="btn-primary" disabled={pending}>{t("createEmployee")}</button>
    </form>
  );
}
