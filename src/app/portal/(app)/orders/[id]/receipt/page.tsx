import { requireArea } from "@/lib/auth";
import { DeliveryReceipt } from "@/components/orders/DeliveryReceipt";
export const metadata = { title: "Delivery receipt" };
// Delivery receipt PDF (print / save as PDF). Not a BIR invoice (Spec 7.5).
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireArea("portal");
  return <DeliveryReceipt user={user} orderId={id} kind="receipt" />;
}
