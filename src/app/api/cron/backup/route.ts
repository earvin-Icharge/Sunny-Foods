import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { asSystem } from "@/lib/db";
import { uploadBuffer } from "@/lib/storage";
import { todayManila } from "@/lib/format";
import { cronAllowed } from "../auth";

export const maxDuration = 300;

// Weekly Excel backup of every table (Spec 8.7). Saved to PRIVATE storage only — never emailed,
// because it contains customers' personal data.
export async function GET(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sunny Foods backup";
  const counts: Record<string, number> = {};
  await asSystem(async (tx) => {
    const tables = await tx`select table_name from information_schema.tables
      where table_schema = 'app' and table_type = 'BASE TABLE' order by table_name`;
    for (const t of tables) {
      const name = String(t.table_name);
      const rows = await tx.unsafe(`select * from app.${name.replace(/[^a-z0-9_]/g, "")} order by 1`);
      counts[name] = rows.length;
      const ws = wb.addWorksheet(name.slice(0, 31));
      const cols = rows.length ? Object.keys(rows[0]) : ["(empty)"];
      ws.columns = cols.map((c) => ({ header: c, key: c, width: 18 }));
      ws.getRow(1).font = { bold: true };
      for (const r of rows) {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) out[k] = v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
        ws.addRow(out);
      }
    }
  });
  const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  const path = await uploadBuffer(buf, `backups/${todayManila()}_SunnyFoods_Backup.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return NextResponse.json({ ok: true, path, tables: counts });
}
