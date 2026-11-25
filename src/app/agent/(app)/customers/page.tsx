import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { asUser } from "@/lib/db";
import { date, peso } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireAgent } from "../agent-context";

export const metadata = { title: "My customers" };

type C = { id: string; name: string; business_type: string; status: string; contact_person?: string | null; phone?: string | null;
  address?: string | null; balance?: number | null; last_order_at: string | null; month_sales: number; inactive_30: boolean };

// My customers (Spec 7.14): only the fields Master Control allows are returned by the database.
export default async function AgentCustomers() {
  const ctx = await requireAgent();
  const t = await getTranslations("agentPortal");
  const locale = await getLocale();
  const rows = await asUser(ctx.user.id, async (tx) => (await tx`select app.agent_customers_list() as l`)[0].l as C[]);
  return (
    <>
      <PageHeader title={t("myCustomers")} subtitle={t("customersCount", { count: rows.length })} />
      {rows.length === 0 ? <Empty>{t("noCustomers")}</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((c) => (
            <div key={c.id} className="card grid gap-1">
              <div className="flex items-start justify-between gap-2">
                <b className="text-lg">{c.name}</b>
                {c.inactive_30 ? <span className="rounded-full bg-st-problem/15 px-2 py-1 text-xs font-bold text-st-problem">{t("inactive30")}</span>
                  : <StatusBadge kind="generic" status={c.status} />}
              </div>
              {c.contact_person && <div className="text-sm">{c.contact_person}{c.phone ? <> · <a className="text-sunny underline" href={`tel:${c.phone}`}>{c.phone}</a></> : null}</div>}
              {c.address && <div className="text-sm text-brown/70">{c.address}</div>}
              <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                <span>{t("lastOrder")}: <b>{date(c.last_order_at, locale)}</b></span>
                <span>{t("monthSales")}: <b>{peso(c.month_sales)}</b></span>
                {c.balance !== undefined && c.balance !== null && <span>{t("unpaid")}: <b className={c.balance > 0 ? "text-st-problem" : ""}>{peso(c.balance)}</b></span>}
              </div>
              {ctx.canOrder && c.status === "approved" && <Link className="btn-secondary btn-sm mt-2" href={`/agent/new-order/${c.id}`}>➕ {t("newOrder")}</Link>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
