import { getTranslations } from "next-intl/server";
import { asUser } from "@/lib/db";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { requireAgent } from "../agent-context";
import { AgentOrderCard, type AgentOrder } from "./AgentOrderCard";

export const metadata = { title: "Orders" };

// Orders of my customers (Spec 7.14) with status tracker. Month filter.
export default async function AgentOrders({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAgent();
  const t = await getTranslations("agentPortal");
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : "";
  const rows = await asUser(ctx.user.id, async (tx) =>
    (await tx`select app.agent_orders(${month ? month + "-01" : null}::date) as l`)[0].l as AgentOrder[]);
  return (
    <>
      <PageHeader title={t("orders")} />
      <form className="mb-4 flex gap-2">
        <input type="month" name="month" defaultValue={month} className="input max-w-52" />
        <button className="btn-secondary">{t("filter")}</button>
      </form>
      {rows.length === 0 ? <Empty>{t("noOrders")}</Empty> : <div className="grid gap-3">{rows.map((o) => <AgentOrderCard key={o.id} o={o} />)}</div>}
    </>
  );
}
