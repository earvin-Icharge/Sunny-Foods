import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/perms";
import { PageHeader } from "@/components/ui/PageHeader";
import { OrderForm } from "../OrderForm";
import { orderFormData } from "../formData";

export const metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: PageProps<"/staff/orders/new">) {
  const user = await requirePerm("internal", "orders", 2);
  const t = await getTranslations("orders");
  const locale = await getLocale();
  const sp = await searchParams;
  const d = await orderFormData(user, locale);
  return (
    <>
      <PageHeader title={t("newOrder")} back="/staff/orders" />
      <OrderForm mode="new" customers={d.customers} products={d.products} timeWindows={d.timeWindows} showPrice={d.showPrice}
        canManualDiscount={can(user.perms, "orders", 2)} initial={{ customer_id: typeof sp.customer === "string" ? sp.customer : undefined }} />
    </>
  );
}
