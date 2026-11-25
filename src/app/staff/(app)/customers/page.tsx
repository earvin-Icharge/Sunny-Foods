import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { date, peso } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { Input, Select } from "@/components/ui/Field";

export const metadata = { title: "Customers" };
const STATUSES = ["approved", "pending", "suspended", "rejected"];

export default async function CustomersPage({ searchParams }: PageProps<"/staff/customers">) {
  const user = await requirePerm("internal", "customers");
  const t = await getTranslations("customers");
  const locale = await getLocale();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const data = await readAs(user, async (tx) => {
    const rows = await tx`select id, code, name, business_type, contact_person, phone, status, is_employee_account, agent_name,
        price_tier_name, payment_terms, balance, last_order_at
      from app.v_customers
      where deleted_at is null and (${status} = '' or status = ${status})
        and (${kind} = '' or (${kind} = 'employee') = is_employee_account)
        and (${q} = '' or name ilike ${"%" + q + "%"} or code ilike ${"%" + q + "%"} or contact_person ilike ${"%" + q + "%"})
      order by (status = 'pending') desc, name limit 500`;
    const [p] = await tx`select count(*)::int as n from app.customers where status = 'pending' and deleted_at is null`;
    return { rows, pending: Number(p.n) };
  });
  return (
    <>
      <PageHeader title={t("title")} actions={<>
        {can(user.perms, "customers", 5) && <Link className="btn-secondary" href="/staff/customers/new-employee">+ {t("addEmployee")}</Link>}
        {can(user.perms, "customers", 2) && <Link className="btn-primary" href="/staff/customers/new">+ {t("add")}</Link>}
      </>} />
      {data.pending > 0 && status !== "pending" && (
        <Link href="/staff/customers?status=pending" className="card mb-4 flex items-center justify-between ring-2 ring-gold">
          <b>{t("pendingBanner", { n: data.pending })}</b><span className="text-sunny">→</span>
        </Link>
      )}
      <form className="mb-4 grid gap-2 sm:grid-cols-4">
        <Input name="q" defaultValue={q} placeholder={t("search")} className="sm:col-span-2" />
        <Select name="status" defaultValue={status}>
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`status_${s}`)}</option>)}
        </Select>
        <Select name="kind" defaultValue={kind}>
          <option value="">{t("allKinds")}</option>
          <option value="business">{t("businesses")}</option>
          <option value="employee">{t("employees")}</option>
        </Select>
        <button className="btn-secondary sm:col-span-4">{t("searchButton")}</button>
      </form>
      {data.rows.length === 0 ? <Empty>{t("none")}</Empty> : (
        <div className="grid gap-2">
          {data.rows.map((c) => (
            <Link key={String(c.id)} href={`/staff/customers/${c.id}`} className="card flex flex-wrap items-center gap-3 hover:ring-sunny/40">
              <div className="min-w-0 flex-1">
                <div className="font-bold">{String(c.name)} {c.is_employee_account ? <span className="ml-1 rounded bg-gold/20 px-2 text-xs">{t("employee")}</span> : null}</div>
                <div className="text-sm text-brown/60">
                  {t(`type_${c.business_type}`)}{c.contact_person ? ` · ${c.contact_person}` : ""}{c.phone ? ` · ${c.phone}` : ""}
                  {c.agent_name ? ` · 🤝 ${c.agent_name}` : ""}
                </div>
                <div className="text-xs text-brown/50">{c.last_order_at ? t("lastOrder", { date: date(c.last_order_at as string, locale) }) : t("noOrdersYet")}</div>
              </div>
              {fieldOn(user.perms, "customer_balance") && Number(c.balance) > 0 && <span className="font-semibold text-st-problem">{peso(c.balance as number)}</span>}
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${c.status === "approved" ? "bg-st-ok/15 text-st-ok" : c.status === "pending" ? "bg-gold/30 text-charcoal" : "bg-st-problem/15 text-st-problem"}`}>
                {t(`status_${c.status}`)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
