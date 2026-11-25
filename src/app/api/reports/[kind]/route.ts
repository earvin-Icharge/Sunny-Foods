import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { asUser, dbErrorMessage } from "@/lib/db";
import { can, fieldOn } from "@/lib/perms";
import { todayManila } from "@/lib/format";
import { MONEY_COLUMNS, isReportKind } from "@/app/staff/(app)/reports/kinds";

// Excel export of a report (Spec 7.8). Runs as the user, so the database checks access again.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/reports/[kind]">) {
  const { kind } = await ctx.params;
  const s = await getSession();
  if (!s || s.area !== "internal") return NextResponse.json({ error: "Please log in." }, { status: 401 });
  if (!can(s.perms, "reports") || !fieldOn(s.perms, "sales_totals") || !isReportKind(kind)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const today = todayManila();
  const from = sp.get("from") || today.slice(0, 8) + "01";
  const to = sp.get("to") || today;
  const group = ["day", "week", "month"].includes(sp.get("group") ?? "") ? sp.get("group")! : "day";
  let rows: Record<string, unknown>[];
  try {
    rows = await asUser(s.id, async (tx) => {
      const [r] = await tx`select app.report(${kind}, ${from}::date, ${to}::date, ${group}) as rows`;
      return r.rows as Record<string, unknown>[];
    });
  } catch (e) {
    return NextResponse.json({ error: dbErrorMessage(e) }, { status: 400 });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sunny Foods";
  const ws = wb.addWorksheet(kind.slice(0, 31));
  const cols = rows.length ? Object.keys(rows[0]) : ["no_data"];
  ws.columns = cols.map((c) => ({
    header: c.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase()), key: c, width: Math.max(12, c.length + 4),
    style: MONEY_COLUMNS.has(c) ? { numFmt: '"₱"#,##0.00' } : {},
  }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5EDE4" } };
  rows.forEach((r) => ws.addRow(r));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  const name = `${today}_SunnyFoods_${kind}_${from}_to_${to}.xlsx`;
  return new NextResponse(Buffer.from(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
