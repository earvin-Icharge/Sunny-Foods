import { getTranslations } from "next-intl/server";
import { CheckoutView } from "@/components/portal/CheckoutView";
import { PageHeader } from "@/components/ui/PageHeader";
export const metadata = { title: "Cart" };
export default async function CartPage() {
  const t = await getTranslations("checkout");
  return (
    <>
      <PageHeader title={t("title")} />
      <CheckoutView mode="portal" catalogHref="/portal" ordersHref="/portal/orders" />
    </>
  );
}
