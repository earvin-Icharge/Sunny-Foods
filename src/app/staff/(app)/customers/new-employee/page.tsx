import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmployeeForm } from "./EmployeeForm";

export const metadata = { title: "New employee buyer" };

export default async function NewEmployee() {
  const user = await requirePerm("internal", "customers", 5);
  const t = await getTranslations("customers");
  const staff = await readAs(user, (tx) => tx`select p.id, p.full_name, p.email, r.name as role from app.profiles p join app.roles r on r.key = p.role_key
    where r.area = 'internal' and p.active and p.deleted_at is null
      and not exists (select 1 from app.customers c where c.employee_profile_id = p.id and c.deleted_at is null and c.status <> 'suspended')
    order by p.full_name`);
  return (
    <>
      <PageHeader title={t("addEmployee")} subtitle={t("employeeHelp")} back="/staff/customers" />
      <EmployeeForm staff={staff.map((s) => ({ id: String(s.id), name: `${s.full_name} (${s.role})`, email: String(s.email ?? "") }))} />
    </>
  );
}
