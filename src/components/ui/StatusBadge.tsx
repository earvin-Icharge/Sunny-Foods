"use client";
import { useTranslations } from "next-intl";

// Status colors (Spec 5): grey new, blue confirmed, orange packing, green ready/delivered, red problem/unpaid
const ORDER_COLORS: Record<string, string> = {
  new: "bg-st-new/15 text-st-new",
  confirmed: "bg-st-confirmed/15 text-st-confirmed",
  packing: "bg-st-packing/15 text-st-packing",
  packed: "bg-st-ok/15 text-st-ok",
  out_for_delivery: "bg-st-ok/15 text-st-ok",
  delivered: "bg-st-ok/15 text-st-ok",
  completed: "bg-st-ok/25 text-st-ok",
  cancelled: "bg-st-problem/15 text-st-problem",
};
const PAY_COLORS: Record<string, string> = {
  unpaid: "bg-st-problem/15 text-st-problem",
  partial: "bg-st-packing/15 text-st-packing",
  paid: "bg-st-ok/15 text-st-ok",
  overdue: "bg-st-problem text-white",
};
const STOCK_COLORS: Record<string, string> = {
  available: "bg-st-ok/15 text-st-ok",
  limited: "bg-st-packing/15 text-st-packing",
  out: "bg-st-problem/15 text-st-problem",
};

export function StatusBadge({ status, kind = "order" }: { status: string; kind?: "order" | "payment" | "stock" | "generic" }) {
  const t = useTranslations("status");
  const colors = kind === "payment" ? PAY_COLORS : kind === "stock" ? STOCK_COLORS : ORDER_COLORS;
  const cls = colors[status] ?? "bg-brown/10 text-brown";
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${cls}`}>{t(status)}</span>;
}
