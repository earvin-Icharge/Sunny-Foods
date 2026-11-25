import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerForm } from "../CustomerForm";

export default async function NewCustomer() {
  const user = await requirePerm("internal", "customers", 2);
  const t = await getTranslations("customers");
  const tiers = fieldOn(user.perms, "price")
    ? await readAs(user, (tx) => tx`select id, name from app.price_tiers where deleted_at is null and active and key <> 'regular' order by name`) : [];
  return (
    <>
      <PageHeader title={t("add")} back="/staff/customers" />
      <CustomerForm customer={null} tiers={tiers.map((x) => ({ id: String(x.id), name: String(x.name) }))} canEdit
        canSetTier={can(user.perms, "customers", 5)} showContact={fieldOn(user.perms, "customer_contact")} showAddress={fieldOn(user.perms, "customer_address")} />
    </>
  );
}
