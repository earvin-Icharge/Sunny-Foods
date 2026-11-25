import { getTranslations } from "next-intl/server";
import { peso } from "@/lib/format";

export type Discount = { kind: string; label: string; code?: string | null; amount: number; affects_total?: boolean };
export type Totals = {
  subtotal: number | null; delivery_fee: number | null; vatable_sales: number | null; vat_exempt_sales: number | null;
  vat_amount: number | null; total: number | null; paid_amount?: number | null; prices_include_vat?: boolean;
};

/**
 * Price breakdown on every order (Spec 7.5):
 * Subtotal → tier/employee discount → voucher (code shown) → delivery fee → Total, then VAT lines.
 * Server component; a client version for live checkout previews is in OrderBreakdownClient.
 */
export async function OrderBreakdown({ totals, discounts }: { totals: Totals; discounts: Discount[] }) {
  const t = await getTranslations("orderBreakdown");
  if (totals.total === null) return null;
  return <BreakdownView totals={totals} discounts={discounts} labels={{
    subtotal: t("subtotal"), deliveryFee: t("deliveryFee"), free: t("free"), total: t("total"), vatable: t("vatableSales"),
    exempt: t("vatExemptSales"), vat: t("vat"), paid: t("paid"), balance: t("balance"), voucher: t("voucher"), vatIncluded: t("vatIncluded"),
  }} />;
}

export type BreakdownLabels = Record<"subtotal" | "deliveryFee" | "free" | "total" | "vatable" | "exempt" | "vat" | "paid" | "balance" | "voucher" | "vatIncluded", string>;

export function BreakdownView({ totals, discounts, labels }: { totals: Totals; discounts: Discount[]; labels: BreakdownLabels }) {
  const freeDelivery = discounts.find((d) => d.kind === "free_delivery");
  return (
    <dl className="grid gap-1 text-sm">
      <Row label={labels.subtotal} value={peso(totals.subtotal)} />
      {discounts.filter((d) => d.kind !== "free_delivery" && Number(d.amount) !== 0).map((d, i) => (
        <Row key={i} label={<>{d.label}{d.code ? <span className="ml-1 rounded bg-gold/20 px-1.5 font-mono text-xs">{d.code}</span> : null}</>}
          value={"− " + peso(d.amount)} tone="discount" />
      ))}
      <Row label={labels.deliveryFee} value={freeDelivery ? <><s className="text-brown/50">{peso(freeDelivery.amount)}</s> {labels.free}</> : peso(totals.delivery_fee)} />
      <div className="my-1 border-t border-brown/10" />
      <Row label={<b className="text-base">{labels.total}</b>} value={<b className="text-lg text-sunny">{peso(totals.total)}</b>} />
      {totals.paid_amount !== undefined && totals.paid_amount !== null && Number(totals.paid_amount) > 0 && <>
        <Row label={labels.paid} value={peso(totals.paid_amount)} />
        <Row label={<b>{labels.balance}</b>} value={<b>{peso(Number(totals.total) - Number(totals.paid_amount))}</b>} />
      </>}
      <div className="mt-2 grid gap-0.5 rounded-lg bg-cream-light p-2 text-xs text-brown/70">
        <Row label={labels.vatable} value={peso(totals.vatable_sales)} />
        <Row label={labels.exempt} value={peso(totals.vat_exempt_sales)} />
        <Row label={labels.vat + (totals.prices_include_vat === false ? "" : ` (${labels.vatIncluded})`)} value={peso(totals.vat_amount)} />
      </div>
    </dl>
  );
}

function Row({ label, value, tone }: { label: React.ReactNode; value: React.ReactNode; tone?: "discount" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={tone === "discount" ? "text-st-ok" : ""}>{label}</dt>
      <dd className={`text-right tabular-nums ${tone === "discount" ? "text-st-ok" : ""}`}>{value}</dd>
    </div>
  );
}
