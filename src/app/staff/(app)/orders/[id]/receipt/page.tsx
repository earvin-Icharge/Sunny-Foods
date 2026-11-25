import { requirePerm } from "@/lib/auth";
import { DeliveryReceipt } from "@/components/orders/DeliveryReceipt";

export const metadata = { title: "Delivery receipt" };

export default async function Page({ params }: PageProps<"/staff/orders/[id]/receipt">) {
  const { id } = await params;
  const user = await requirePerm("internal", "orders");
  return <DeliveryReceipt user={user} orderId={id} kind="receipt" />;
}
