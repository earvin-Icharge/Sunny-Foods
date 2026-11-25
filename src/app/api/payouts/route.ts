import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { can } from "@/lib/perms";

// Excel export of commission payouts + their lines (Spec 7.13 payout run).
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s || s.area !== "internal" || !can(s.perms, "agents")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const status = req.nextUrl.searchParams.get("status") ?? "open";
  const data = await asUser(s.id, async (tx) => {
    const payouts = await tx`select p.id, a.name as agent, a.payout_method, a.payout_name, p.period_start, p.period_end, p.gross, p.adjustments, p.net,
        p.status, p.paid_at, p.method, p.reference
      from app.commission_payouts p join app.agents a on a.id = p.agent_id
      where p.deleted_at is null and (${status} = 'all' or (${status} = 'open' and p.status in ('draft','approved')) or p.status = ${status})
      order by p.period_end desc, a.name`;
    const ids = payouts.map((p) => String(p.id));
    const lines = await tx`select a.name as agent, o.order_no, c.name as customer, cm.base_amount, cm.rate, cm.share_pct, cm.amount, cm.status, cm.earned_at
      from app.commissions cm join app.agents a on a.id = cm.agent_id join app.orders o on o.id = cm.order_id join app.customers c on c.id = cm.customer_id
      where cm.payout_id = any(${ids}::uuid[]) order by a.name, cm.earned_at`;
    const adj = await tx`select a.name as agent, ad.amount, ad.reason, ad.status from app.commission_adjustments ad join app.agents a on a.id = ad.agent_id
      where ad.payout_id = any(${ids}::uuid[]) order by a.name`;
    return { payouts, lines, adj };
  });
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sunny Foods";
  const sheet = (name: string, rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name);
    const cols = rows[0] ? Object.keys(rows[0]).filter((k) => k !== "id") : ["empty"];
    ws.columns = cols.map((k) => ({ header: k.replace(/_/g, " ").toUpperCase(), key: k, width: 18 }));
    rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
  };
  sheet("Payouts", data.payouts as unknown as Record<string, unknown>[]);
  sheet("Commission lines", data.lines as unknown as Record<string, unknown>[]);
  sheet("Adjustments", data.adj as unknown as Record<string, unknown>[]);
  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${today}_SunnyFoods_Payouts.xlsx"`,
    },
  });
}
