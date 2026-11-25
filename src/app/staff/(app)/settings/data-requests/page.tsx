import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { dateTime } from "@/lib/format";
import { fileUrl } from "@/lib/storage";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DecideButtons } from "./DecideButtons";

export const metadata = { title: "Data requests" };

/** Data Privacy Act (RA 10173): copy / deletion requests and consent records. */
export default async function DataRequests() {
  const user = await requirePerm("internal", "settings", 5);
  const t = await getTranslations("settings");
  const locale = await getLocale();
  const d = await readAs(user, async (tx) => ({
    reqs: await tx`select r.*, p.full_name, p.email, p.role_key, c.name as customer_name, a.name as agent_name
      from app.data_requests r join app.profiles p on p.id = r.profile_id
      left join app.customers c on c.id = r.customer_id left join app.agents a on a.id = r.agent_id
      where r.deleted_at is null order by (r.status = 'pending') desc, r.created_at desc limit 200`,
    consents: await tx`select pc.*, p.full_name, p.email from app.privacy_consents pc join app.profiles p on p.id = pc.profile_id
      order by pc.consented_at desc limit 100`,
  }));
  const links = await Promise.all(d.reqs.map((r) => fileUrl(r.export_path as string | null)));
  return (
    <>
      <PageHeader title={t("dataRequests")} subtitle={t("dataRequestsHelp")} back="/staff/settings" />
      {d.reqs.length === 0 ? <Empty>{t("noDataRequests")}</Empty> : (
        <div className="grid gap-3">
          {d.reqs.map((r, i) => (
            <div key={String(r.id)} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-56 flex-1">
                <div className="font-bold">{t(`dr_${r.kind}`)} · {String(r.full_name)}</div>
                <div className="text-sm text-brown/60">{String(r.email ?? "")} · {String(r.customer_name ?? r.agent_name ?? r.role_key)} · {dateTime(r.created_at as string, locale)}</div>
                {r.notes ? <div className="text-sm">“{String(r.notes)}”</div> : null}
                {r.kind === "deletion" && r.status === "pending" && <div className="mt-1 text-xs text-st-problem">{t("deletionWarning")}</div>}
              </div>
              <StatusBadge kind="generic" status={String(r.status)} />
              {links[i] && <a className="btn-secondary btn-sm" href={links[i]!} target="_blank" rel="noreferrer">{t("downloadCopy")}</a>}
              {r.status === "pending" && <DecideButtons id={String(r.id)} kind={String(r.kind)} name={String(r.full_name)} />}
            </div>
          ))}
        </div>
      )}
      <h2 className="mb-3 mt-8 text-xl font-bold">{t("consents")}</h2>
      <div className="card table-wrap p-0">
        <table className="table">
          <thead><tr><th>{t("person")}</th><th>{t("policyVersion")}</th><th>{t("when")}</th></tr></thead>
          <tbody>{d.consents.map((c) => (
            <tr key={String(c.id)}><td>{String(c.full_name)}<div className="text-xs text-brown/60">{String(c.email ?? "")}</div></td>
              <td>{String(c.policy_version)}</td><td>{dateTime(c.consented_at as string, locale)}</td></tr>))}</tbody>
        </table>
      </div>
    </>
  );
}
