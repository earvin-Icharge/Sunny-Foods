import Link from "next/link";
import { OrderDetailView } from "@/components/portal/OrderDetailView";
export const metadata = { title: "Order" };
export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  return (
    <>
      <Link href="/portal/orders" className="mb-2 inline-block text-sm font-semibold text-sunny">← Back</Link>
      <OrderDetailView id={id} placed={sp.placed === "1"} />
    </>
  );
}
