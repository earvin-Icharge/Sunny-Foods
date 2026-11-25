import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { VoucherForm } from "../VoucherForm";
import { voucherOptions } from "../load";

export const metadata = { title: "New voucher" };

export default async function NewVoucher() {
  const user = await requirePerm("internal", "vouchers", 5);
  const t = await getTranslations("vouchers");
  const opts = await readAs(user, (tx) => voucherOptions(tx));
  return (
    <>
      <PageHeader title={t("add")} back="/staff/vouchers" />
      <VoucherForm voucher={null} targets={[]} {...opts} canEdit />
    </>
  );
}
