import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CatalogView } from "@/components/portal/CatalogView";
import { requireAgent } from "../../agent-context";

export const metadata = { title: "New order" };

// Agent mode: same catalog as the customer portal, for one linked customer.
export default async function AgentCatalog({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  await requireAgent({ order: true });
  const t = await getTranslations("agentPortal");
  return (
    <>
      <Link href="/agent/new-order" className="mb-2 inline-block text-sm font-semibold text-sunny">← {t("pickCustomer")}</Link>
      <CatalogView mode="agent" customerId={customerId} cartHref={`/agent/new-order/${customerId}/checkout`} />
    </>
  );
}
