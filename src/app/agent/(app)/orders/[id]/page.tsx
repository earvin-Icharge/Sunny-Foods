import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asUser } from "@/lib/db";
import { requireAgent } from "../../agent-context";
import { AgentOrderCard, type AgentOrder } from "../AgentOrderCard";

export const metadata = { title: "Order" };

export default async function AgentOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireAgent();
  const t = await getTranslations("agentPortal");
  const rows = await asUser(ctx.user.id, async (tx) => (await tx`select app.agent_orders(null) as l`)[0].l as AgentOrder[]);
  const o = rows.find((r) => r.id === id);
  if (!o) notFound();
  return (
    <>
      <Link href="/agent/orders" className="mb-2 inline-block text-sm font-semibold text-sunny">← {t("orders")}</Link>
      {sp.placed === "1" && <div className="mb-3 rounded-xl bg-st-ok/10 p-4 font-semibold text-st-ok">✓ {t("placed", { no: o.order_no, name: o.customer_name })}</div>}
      <AgentOrderCard o={o} open />
    </>
  );
}
