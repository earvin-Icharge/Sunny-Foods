import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { dateTime } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DecideDelete } from "./DecideDelete";

export const metadata = { title: "Delete requests" };

/** Staff can only request a delete; the boss approves (Spec 8.4). */
export default async function DeleteRequests() {
  const user = await requirePerm("internal", "trash");
  const t = await getTranslations("trash");
  const locale = await getLocale();
  const rows = await readAs(user, (tx) => tx`
    select r.*, p.full_name as requester, d.full_name as decider from app.delete_requests r
    left join app.profiles p on p.id = r.requested_by left join app.profiles d on d.id = r.decided_by
    where r.deleted_at is null order by (r.status = 'pending') desc, r.created_at desc limit 200`);
  return (
    <>
      <PageHeader title={t("deleteRequests")} back="/staff/trash" />
      {rows.length === 0 ? <Empty>{t("noRequests")}</Empty> : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <div key={String(r.id)} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-48 flex-1">
                <div className="font-bold">{String(r.record_label ?? r.record_id)}</div>
                <div className="text-sm text-brown/60">{t(`table_${r.table_name}`)} · {t("requestedBy", { name: String(r.requester ?? "—"), when: dateTime(r.created_at as string, locale) })}</div>
                {r.reason ? <div className="text-sm">“{String(r.reason)}”</div> : null}
                {r.decider ? <div className="text-xs text-brown/60">{t("decidedBy", { name: String(r.decider) })}</div> : null}
              </div>
              <StatusBadge kind="generic" status={String(r.status)} />
              {r.status === "pending" && can(user.perms, "trash", 5) && <DecideDelete id={String(r.id)} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
