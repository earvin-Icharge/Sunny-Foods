import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { fieldOn } from "@/lib/perms";
import { peso, qty, todayManila } from "@/lib/format";
import { MONEY_COLUMNS, REPORT_KINDS, isReportKind } from "./kinds";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { Input, Select } from "@/components/ui/Field";

export const metadata = { title: "Reports" };

// Reports for the boss (Spec 7.8) + Excel export.
export default async function ReportsPage({ searchParams }: PageProps<"/staff/reports">) {
  const user = await requirePerm("internal", "reports");
  const t = await getTranslations("reports");
  const sp = await searchParams;
  const kind = isReportKind(sp.kind) ? sp.kind : "sales_by_period";
  const today = todayManila();
  const from = typeof sp.from === "string" && sp.from ? sp.from : today.slice(0, 8) + "01";
  const to = typeof sp.to === "string" && sp.to ? sp.to : today;
  const group = typeof sp.group === "string" && ["day", "week", "month"].includes(sp.group) ? sp.group : "day";
  if (!fieldOn(user.perms, "sales_totals")) {
    return <><PageHeader title={t("title")} /><Empty>{t("noAccess")}</Empty></>;
  }
  const rows = (await readAs(user, async (tx) => {
    const [r] = await tx`select app.report(${kind}, ${from}::date, ${to}::date, ${group}) as rows`;
    return r.rows;
  })) as Record<string, unknown>[];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const noDates = kind === "unpaid" || kind === "stock";
  const qs = new URLSearchParams({ from, to, group }).toString();
  const totals = Object.fromEntries(cols.filter((c) => MONEY_COLUMNS.has(c) || c === "orders" || c === "uses" || c === "qty")
    .map((c) => [c, rows.reduce((s, r) => s + Number(r[c] ?? 0), 0)]));
  return (
    <>
      <PageHeader title={t("title")} actions={<a className="btn-primary" href={`/api/reports/${kind}?${qs}`}>⬇️ {t("excel")}</a>} />
      <nav className="no-print -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {REPORT_KINDS.map((k) => (
          <Link key={k} href={`/staff/reports?kind=${k}&${qs}`}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${k === kind ? "bg-sunny text-white" : "bg-white ring-1 ring-brown/10"}`}>{t(`k_${k}`)}</Link>
        ))}
      </nav>
      {!noDates && (
        <form className="card mb-4 grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="kind" value={kind} />
          <label><span className="label">{t("from")}</span><Input type="date" name="from" defaultValue={from} /></label>
          <label><span className="label">{t("to")}</span><Input type="date" name="to" defaultValue={to} /></label>
          {kind === "sales_by_period" ? (
            <label><span className="label">{t("groupBy")}</span>
              <Select name="group" defaultValue={group}><option value="day">{t("day")}</option><option value="week">{t("week")}</option><option value="month">{t("month")}</option></Select>
            </label>
          ) : <input type="hidden" name="group" value={group} />}
          <button className="btn-secondary self-end">{t("show")}</button>
        </form>
      )}
      <p className="mb-2 text-sm text-brown/70">{t(`h_${kind}`)}</p>
      {rows.length === 0 ? <Empty>{t("noData")}</Empty> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr>{cols.map((c) => <th key={c} className={isNum(rows[0][c]) ? "text-right" : ""}>{t.has(`c_${c}`) ? t(`c_${c}`) : c}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{cols.map((c) => <td key={c} className={isNum(r[c]) ? "text-right tabular-nums" : ""}>{cell(c, r[c])}</td>)}</tr>
              ))}
            </tbody>
            {Object.keys(totals).length > 0 && (
              <tfoot><tr className="font-bold">{cols.map((c, i) => <td key={c} className="border-t-2 border-brown/20 px-3 py-2 text-right">{i === 0 ? t("total") : c in totals ? cell(c, totals[c]) : ""}</td>)}</tr></tfoot>
            )}
          </table>
        </div>
      )}
    </>
  );
}

function isNum(v: unknown) { return typeof v === "number"; }
function cell(col: string, v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return MONEY_COLUMNS.has(col) ? peso(v) : qty(v);
  return String(v);
}
