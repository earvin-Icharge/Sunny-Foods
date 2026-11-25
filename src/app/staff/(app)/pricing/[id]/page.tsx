import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { localName } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { AuditHistory } from "@/components/ui/AuditHistory";
import { TierPriceGrid } from "./TierPriceGrid";

export default async function TierPage({ params }: PageProps<"/staff/pricing/[id]">) {
  const { id } = await params;
  const user = await requirePerm("internal", "customers", 5);
  const t = await getTranslations("pricing");
  const locale = await getLocale();
  const data = await readAs(user, async (tx) => {
    const [tier] = await tx`select * from app.price_tiers where id = ${id} and deleted_at is null`;
    if (!tier) return null;
    const rows = await tx`select p.id, p.sku, p.name, p.name_zh_hans, p.name_zh_hant, p.name_tl, p.default_price,
        (select tp.price from app.tier_prices tp where tp.tier_id = ${id} and tp.product_id = p.id and tp.deleted_at is null) as price
      from app.products p where p.deleted_at is null and p.archived_at is null order by p.name`;
    return { tier, rows };
  });
  if (!data) notFound();
  const pct = data.tier.kind === "percent" ? Number(data.tier.percent_off) : 0;
  return (
    <>
      <PageHeader title={String(data.tier.name)} subtitle={data.tier.kind === "percent" ? t("gridHelpPercent", { n: pct }) : t("gridHelpFixed")} back="/staff/pricing" />
      <TierPriceGrid tierId={id} rows={data.rows.map((r) => ({
        productId: String(r.id), name: `${localName(r, locale)} (${r.sku})`, regular: Number(r.default_price),
        fromPercent: pct > 0 ? Math.round(Number(r.default_price) * (1 - pct / 100) * 100) / 100 : null,
        price: r.price === null ? null : Number(r.price),
      }))} />
      <AuditHistory user={user} table="price_tiers" id={id} />
    </>
  );
}
