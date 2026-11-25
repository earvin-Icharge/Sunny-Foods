import { getTranslations } from "next-intl/server";
import { OrdersList } from "@/components/portal/OrdersList";
import { PageHeader } from "@/components/ui/PageHeader";
export const metadata = { title: "My Orders" };
export default async function OrdersPage() {
  const t = await getTranslations("nav");
  return <><PageHeader title={t("myOrders")} /><OrdersList /></>;
}
