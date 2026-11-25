// Report kinds (Spec 7.8) — shared by the reports screen and the Excel export.
export const REPORT_KINDS = [
  "sales_by_period", "sales_by_product", "sales_by_customer", "sales_by_agent", "discounts",
  "employee_purchases", "commissions", "unpaid", "stock", "spoilage",
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const MONEY_COLUMNS = new Set([
  "subtotal", "discounts", "delivery_fees", "vat", "total", "net", "cost", "margin", "unpaid", "sales", "amount",
  "salary_deduction", "pending", "earned", "approved", "paid", "voided", "paid_amount", "balance", "stock_value", "value",
]);

export function isReportKind(v: unknown): v is ReportKind {
  return typeof v === "string" && (REPORT_KINDS as readonly string[]).includes(v);
}
