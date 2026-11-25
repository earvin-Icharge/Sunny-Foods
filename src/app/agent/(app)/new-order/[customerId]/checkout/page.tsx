import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckoutView } from "@/components/portal/CheckoutView";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAgent } from "../../../agent-context";

export const metadata = { title: "Checkout" };

export default async function AgentCheckout({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const ctx = await requireAgent({ order: true });
  const t = await getTranslations("checkout");
  return (
    <>
      <Link href={`/agent/new-order/${customerId}`} className="mb-2 inline-block text-sm font-semibold text-sunny">← {t("addMore")}</Link>
      <PageHeader title={t("title")} />
      <CheckoutView mode="agent" customerId={customerId} catalogHref={`/agent/new-order/${customerId}`} ordersHref="/agent/orders"
        allowVoucher={ctx.user.perms.fields.ag_act_voucher === "on"} />
    </>
  );
}
