"use client";
import { useTranslations } from "next-intl";
import { BreakdownView, type Discount, type Totals } from "./OrderBreakdown";

/** Same breakdown for client screens (checkout preview, staff order form). Pass the quote from app.quote_order. */
export function OrderBreakdownClient({ totals, discounts }: { totals: Totals; discounts: Discount[] }) {
  const t = useTranslations("orderBreakdown");
  return <BreakdownView totals={totals} discounts={discounts} labels={{
    subtotal: t("subtotal"), deliveryFee: t("deliveryFee"), free: t("free"), total: t("total"), vatable: t("vatableSales"),
    exempt: t("vatExemptSales"), vat: t("vat"), paid: t("paid"), balance: t("balance"), voucher: t("voucher"), vatIncluded: t("vatIncluded"),
  }} />;
}
