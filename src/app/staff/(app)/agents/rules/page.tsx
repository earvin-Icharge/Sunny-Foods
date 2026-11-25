import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { PageHeader } from "@/components/ui/PageHeader";
import { RulesEditor } from "../RulesEditor";

export const metadata = { title: "Commission rules" };

/** Rules that apply to ALL agents (an agent's own rules win). */
export default async function RulesPage() {
  const user = await requirePerm("internal", "agents");
  if (!fieldOn(user.perms, "commission_rates")) redirect("/staff/not-allowed");
  const t = await getTranslations("agents");
  const d = await readAs(user, async (tx) => ({
    rules: await tx`select r.*, p.name as product_name, c.name as category_name from app.commission_rules r
      left join app.products p on p.id = r.product_id left join app.categories c on c.id = r.category_id
      where r.agent_id is null and r.deleted_at is null order by r.scope, r.min_monthly_sales nulls first`,
    products: await tx`select id, name from app.products where deleted_at is null order by name`,
    categories: await tx`select id, name from app.categories where deleted_at is null order by sort`,
  }));
  const opts = (rows: Record<string, unknown>[]) => rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
  return (
    <>
      <PageHeader title={t("rules")} subtitle={t("globalRulesHelp")} back="/staff/agents" />
      <RulesEditor agentId={null} canEdit={can(user.perms, "agents", 5)} products={opts(d.products)} categories={opts(d.categories)}
        rules={d.rules.map((r) => ({ id: String(r.id), scope: String(r.scope), target: String(r.product_name ?? r.category_name ?? ""),
          rateKind: String(r.rate_kind), rate: Number(r.rate), minSales: r.min_monthly_sales === null ? null : Number(r.min_monthly_sales),
          maxMonths: r.max_months === null ? null : Number(r.max_months), active: Boolean(r.active) }))} />
    </>
  );
}
