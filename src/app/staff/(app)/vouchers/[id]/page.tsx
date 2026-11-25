import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { dateTime, peso } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { AuditHistory } from "@/components/ui/AuditHistory";
import { VoucherForm } from "../VoucherForm";
import { ArchiveVoucherButton, PauseButton } from "../VoucherButtons";
import { voucherOptions } from "../load";

export default async function VoucherPage({ params }: PageProps<"/staff/vouchers/[id]">) {
  const { id } = await params;
  const user = await requirePerm("internal", "vouchers");
  const t = await getTranslations("vouchers");
  const locale = await getLocale();
  const canManage = can(user.perms, "vouchers", 5);
  const data = await readAs(user, async (tx) => {
    const [v] = await tx`select * from app.vouchers where id = ${id} and deleted_at is null`;
    if (!v) return null;
    const targets = await tx`select target_type, target_id from app.voucher_targets where voucher_id = ${id} and deleted_at is null`;
    const uses = await tx`select r.amount, r.status, r.created_at, o.id as order_id, o.order_no, c.name as customer
      from app.voucher_redemptions r join app.orders o on o.id = r.order_id join app.customers c on c.id = r.customer_id
      where r.voucher_id = ${id} and r.deleted_at is null order by r.created_at desc limit 300`;
    const opts = await voucherOptions(tx);
    return { v, targets, uses, opts };
  });
  if (!data) notFound();
  const { v } = data;
  const active = data.uses.filter((u) => u.status === "active");
  return (
    <>
      <PageHeader title={String(v.name)} subtitle={v.code ? String(v.code) : t("automatic")} back="/staff/vouchers" actions={canManage && <>
        {!v.archived_at && <PauseButton id={id} paused={Boolean(v.paused)} />}
        <ArchiveVoucherButton id={id} archived={Boolean(v.archived_at)} />
      </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card"><div className="text-sm text-brown/60">{t("timesUsed")}</div><div className="text-2xl font-bold">{active.length}</div></div>
        <div className="card"><div className="text-sm text-brown/60">{t("discountGiven")}</div><div className="text-2xl font-bold">{peso(active.reduce((s, u) => s + Number(u.amount), 0))}</div></div>
        <div className="card"><div className="text-sm text-brown/60">{t("remainingUses")}</div><div className="text-2xl font-bold">{v.total_limit ? Math.max(Number(v.total_limit) - active.length, 0) : "∞"}</div></div>
      </div>
      <VoucherForm voucher={v} targets={data.targets.map((x) => ({ type: String(x.target_type), id: String(x.target_id) }))} {...data.opts} canEdit={canManage && !v.archived_at} />
      <h2 className="mb-2 mt-8 text-xl font-bold">{t("usage")}</h2>
      {data.uses.length === 0 ? <p className="card text-brown/60">{t("notUsedYet")}</p> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>{t("when")}</th><th>{t("order")}</th><th>{t("customer")}</th><th className="text-right">{t("discount")}</th></tr></thead>
            <tbody>
              {data.uses.map((u, i) => (
                <tr key={i} className={u.status !== "active" ? "line-through opacity-50" : ""}>
                  <td>{dateTime(u.created_at as string, locale)}</td>
                  <td><Link href={`/staff/orders/${u.order_id}`} className="font-semibold text-sunny">{String(u.order_no)}</Link></td>
                  <td>{String(u.customer)}</td>
                  <td className="text-right">{peso(u.amount as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AuditHistory user={user} table="vouchers" id={id} />
    </>
  );
}
