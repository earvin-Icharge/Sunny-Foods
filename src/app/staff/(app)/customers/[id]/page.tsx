import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { date, localName, peso } from "@/lib/format";
import { fileUrl } from "@/lib/storage";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AuditHistory } from "@/components/ui/AuditHistory";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { CustomerForm } from "../CustomerForm";
import { AddressesPanel, AgentLink, ApprovePanel, EmployeeLimits, SpecialPrices, StatusButton, UsersPanel } from "./Panels";

export default async function CustomerPage({ params }: PageProps<"/staff/customers/[id]">) {
  const { id } = await params;
  const user = await requirePerm("internal", "customers");
  const t = await getTranslations("customers");
  const locale = await getLocale();
  const isBoss = can(user.perms, "customers", 5);
  const showPrice = fieldOn(user.perms, "price");
  const data = await readAs(user, async (tx) => {
    const [c] = await tx`select * from app.v_customers where id = ${id}`;
    if (!c) return null;
    const tiers = showPrice ? await tx`select id, name from app.price_tiers where deleted_at is null and active and key <> 'regular' order by name` : [];
    const agents = isBoss ? await tx`select id, name, type from app.agents where deleted_at is null and status = 'active' order by name` : [];
    const prices = isBoss && showPrice ? await tx`
      select p.id, p.name, p.name_zh_hans, p.name_zh_hant, p.name_tl, p.default_price,
        (select pf.unit_price from app.price_for(${id}::uuid, p.id) pf) as effective,
        (select cp.price from app.customer_prices cp where cp.customer_id = ${id} and cp.product_id = p.id and cp.deleted_at is null) as special,
        (select pf.source from app.price_for(${id}::uuid, p.id) pf) as source
      from app.products p where p.deleted_at is null and p.archived_at is null order by p.name` : [];
    const users = await tx`select p.id, p.full_name, p.email, p.active, cu.is_primary from app.customer_users cu join app.profiles p on p.id = cu.profile_id
      where cu.customer_id = ${id} and cu.deleted_at is null order by cu.is_primary desc, p.full_name`;
    const addresses = await tx`select * from app.customer_addresses where customer_id = ${id} and deleted_at is null order by is_default desc, label`;
    const limits = c.is_employee_account ? await tx`select l.id, l.monthly_amount, l.monthly_packs, p.name as product from app.employee_limits l
      left join app.products p on p.id = l.product_id where l.customer_id = ${id} and l.deleted_at is null order by p.name nulls first` : [];
    const products = c.is_employee_account ? await tx`select id, name from app.products where deleted_at is null and active order by name` : [];
    const orders = can(user.perms, "orders") ? await tx`select id, order_no, status, payment_status, total, created_at from app.v_orders
      where customer_id = ${id} and deleted_at is null order by created_at desc limit 10` : [];
    const [staff] = c.employee_profile_id ? await tx`select full_name, active from app.profiles where id = ${c.employee_profile_id as string}` : [];
    return { c, tiers, agents, prices, users, addresses, limits, products, orders, staff };
  });
  if (!data) notFound();
  const { c } = data;
  const tiers = data.tiers.map((x) => ({ id: String(x.id), name: String(x.name) }));
  const permitUrl = c.permit_path ? await fileUrl(c.permit_path as string) : null;
  const canEdit = can(user.perms, "customers", 3) && !c.anonymized_at;
  return (
    <>
      <PageHeader title={String(c.name)} subtitle={<>{t(`status_${c.status}`)}{c.is_employee_account ? ` · ${t("employee")}` : ""}{c.code ? ` · ${c.code}` : ""}</>}
        back="/staff/customers" actions={canEdit && <>
          <StatusButton id={id} status={String(c.status)} />
          {can(user.perms, "customers", 4) && <ConfirmDelete table="customers" id={id} name={String(c.name)} />}
        </>} />

      {c.status === "pending" && can(user.perms, "customers", 3) && (
        <ApprovePanel id={id} terms={String(c.payment_terms)} tierId={String(c.price_tier_id ?? "")} tiers={tiers}
          permitUrl={permitUrl} referral={(c.referral_code_used as string) ?? null} />
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {fieldOn(user.perms, "customer_balance") && <div className="card"><div className="text-sm text-brown/60">{t("balance")}</div><div className={`text-xl font-bold ${Number(c.balance) > 0 ? "text-st-problem" : ""}`}>{peso(c.balance as number)}</div></div>}
        <div className="card"><div className="text-sm text-brown/60">{t("priceTier")}</div><div className="font-bold">{String(c.price_tier_name ?? t("regularPrice"))}</div></div>
        <div className="card"><div className="text-sm text-brown/60">{t("paymentTerms")}</div><div className="font-bold">{t(`pt_${c.payment_terms}`)}</div></div>
        <div className="card"><div className="text-sm text-brown/60">{t("agent")}</div><div className="font-bold">{String(c.agent_name ?? t("houseAccount"))}</div></div>
      </div>

      {c.is_employee_account && data.staff && (
        <p className="card mb-5 text-sm">👤 {t("linkedStaff")}: <b>{String(data.staff.full_name)}</b> {!data.staff.active && <span className="text-st-problem">({t("staffInactive")})</span>}</p>
      )}

      <CustomerForm customer={c} tiers={tiers} canEdit={canEdit} canSetTier={isBoss && showPrice}
        showContact={fieldOn(user.perms, "customer_contact")} showAddress={fieldOn(user.perms, "customer_address")} />

      {isBoss && (
        <section className="mt-8">
          <h2 className="mb-2 text-xl font-bold">{t("agent")}</h2>
          <p className="mb-2 text-sm text-brown/70">{t("agentHelp")}</p>
          <AgentLink customerId={id} agentId={String(c.agent_id ?? "")} agents={data.agents.map((a) => ({ id: String(a.id), name: `${a.name} (${a.type})` }))} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-xl font-bold">{t("users")}</h2>
        <UsersPanel customerId={id} canAdd={can(user.perms, "customers", 2) && c.status !== "suspended"} canRemove={canEdit}
          users={data.users.map((u) => ({ id: String(u.id), name: String(u.full_name), email: String(u.email ?? ""), primary: Boolean(u.is_primary), active: Boolean(u.active) }))} />
      </section>

      {fieldOn(user.perms, "customer_address") && (
        <section className="mt-8">
          <h2 className="mb-2 text-xl font-bold">{t("addresses")}</h2>
          <AddressesPanel customerId={id} canEdit={canEdit}
            rows={data.addresses.map((a) => ({ id: String(a.id), label: String(a.label), address: String(a.address), isDefault: Boolean(a.is_default), lat: a.lat as number | null, lng: a.lng as number | null }))} />
        </section>
      )}

      {c.is_employee_account && (
        <section className="mt-8">
          <h2 className="mb-2 text-xl font-bold">{t("employeeLimits")}</h2>
          <EmployeeLimits customerId={id} canEdit={isBoss}
            rows={data.limits.map((l) => ({ id: String(l.id), product: (l.product as string) ?? null, amount: l.monthly_amount as number | null, packs: l.monthly_packs as number | null }))}
            products={data.products.map((p) => ({ id: String(p.id), name: String(p.name) }))} />
        </section>
      )}

      {data.prices.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xl font-bold">{t("specialPrices")}</h2>
          <SpecialPrices customerId={id} rows={data.prices.map((p) => ({
            productId: String(p.id), name: localName(p, locale), regular: p.default_price as number,
            tier: p.source === "special" ? null : (p.effective as number), special: p.special === null ? null : Number(p.special),
          }))} />
        </section>
      )}

      {data.orders.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xl font-bold">{t("recentOrders")}</h2>
          <div className="grid gap-2">
            {data.orders.map((o) => (
              <Link key={String(o.id)} href={`/staff/orders/${o.id}`} className="card flex flex-wrap items-center gap-3">
                <b className="flex-1">{String(o.order_no)} <span className="font-normal text-brown/60">· {date(o.created_at as string, locale)}</span></b>
                {o.total !== null && <span>{peso(o.total as number)}</span>}
                <StatusBadge status={String(o.status)} /><StatusBadge kind="payment" status={String(o.payment_status)} />
              </Link>
            ))}
          </div>
        </section>
      )}
      <AuditHistory user={user} table="customers" id={id} />
    </>
  );
}
