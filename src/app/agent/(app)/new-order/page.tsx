import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asUser } from "@/lib/db";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { requireAgent } from "../agent-context";

export const metadata = { title: "New order" };

// New order for a customer (Spec 7.14): pick one of my customers first.
export default async function NewOrderPick() {
  const ctx = await requireAgent({ order: true });
  const t = await getTranslations("agentPortal");
  const rows = await asUser(ctx.user.id, async (tx) => (await tx`select app.agent_customers_list() as l`)[0].l as { id: string; name: string; status: string }[]);
  const ok = rows.filter((c) => c.status === "approved");
  return (
    <>
      <PageHeader title={t("newOrder")} subtitle={t("pickCustomer")} />
      {ok.length === 0 ? <Empty>{t("noCustomers")}</Empty> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {ok.map((c) => <Link key={c.id} href={`/agent/new-order/${c.id}`} className="card flex min-h-16 items-center justify-between font-bold hover:ring-sunny/40">{c.name}<span>→</span></Link>)}
        </div>
      )}
    </>
  );
}
