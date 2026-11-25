import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { PageHeader } from "@/components/ui/PageHeader";
import { OrderForm } from "../../OrderForm";
import { orderFormData } from "../../formData";

export default async function EditOrderPage({ params }: PageProps<"/staff/orders/[id]/edit">) {
  const { id } = await params;
  const user = await requirePerm("internal", "orders", 3);
  const t = await getTranslations("orders");
  const locale = await getLocale();
  const o = await readAs(user, async (tx) => {
    const [o] = await tx`select o.id, o.order_no, o.customer_id, o.customer_name, o.status, o.delivery_method, o.courier_name, o.delivery_date,
      o.time_window, o.payment_method, o.manual_discount, o.manual_discount_reason, o.notes, o.internal_notes from app.v_orders o where o.id = ${id}`;
    if (!o) return null;
    const items = await tx`select product_id, qty from app.order_items where order_id = ${id} and deleted_at is null and not is_free`;
    const [v] = await tx`select code from app.order_discounts where order_id = ${id} and deleted_at is null and code is not null limit 1`;
    return { o, items, code: (v?.code as string) ?? null };
  });
  if (!o) notFound();
  if (!["new", "confirmed"].includes(String(o.o.status))) redirect(`/staff/orders/${id}`);
  const d = await orderFormData(user, locale);
  const dd = o.o.delivery_date ? new Date(o.o.delivery_date as string).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : null;
  return (
    <>
      <PageHeader title={`${t("editOrder")} ${o.o.order_no}`} back={`/staff/orders/${id}`} subtitle={t("editHelp")} />
      <OrderForm mode="edit" orderId={id} customers={[]} products={d.products} timeWindows={d.timeWindows} showPrice={d.showPrice}
        canManualDiscount={can(user.perms, "orders", 2)} initial={{
          customer_id: String(o.o.customer_id), customer_name: String(o.o.customer_name),
          items: o.items.map((i) => ({ product_id: String(i.product_id), qty: Number(i.qty) })),
          delivery_method: String(o.o.delivery_method), courier_name: (o.o.courier_name as string) ?? null, delivery_date: dd,
          time_window: (o.o.time_window as string) ?? null, payment_method: String(o.o.payment_method), voucher_code: o.code,
          manual_discount: Number(o.o.manual_discount) > 0 ? { amount: Number(o.o.manual_discount), reason: (o.o.manual_discount_reason as string)?.replace(/^Manual discount: /, "") ?? null } : null,
          notes: (o.o.notes as string) ?? null, internal_notes: (o.o.internal_notes as string) ?? null,
        }} />
    </>
  );
}
