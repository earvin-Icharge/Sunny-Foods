import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { TierForm } from "./TierForm";

export const metadata = { title: "Price lists" };

// Price tiers (boss only): Regular, Wholesale/Distributor, Employee + more.
export default async function PricingPage() {
  const user = await requirePerm("internal", "customers", 5);
  const t = await getTranslations("pricing");
  const tiers = await readAs(user, (tx) => tx`
    select t.*, (select count(*)::int from app.customers c where c.price_tier_id = t.id and c.deleted_at is null) as customers,
      (select count(*)::int from app.tier_prices p where p.tier_id = t.id and p.deleted_at is null) as fixed_prices
    from app.price_tiers t where t.deleted_at is null order by t.is_builtin desc, t.name`);
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("help")} />
      <details className="card mb-4">
        <summary className="cursor-pointer font-bold">+ {t("addTier")}</summary>
        <div className="mt-3"><TierForm tier={null} /></div>
      </details>
      <div className="grid gap-3">
        {tiers.map((x) => (
          <div key={String(x.id)} className="card">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <b className="text-lg">{String(x.name)}</b> {!x.active && <span className="rounded bg-brown/10 px-2 text-xs">{t("inactive")}</span>}
                <div className="text-sm text-brown/70">
                  {x.key === "regular" ? t("regularHelp") : x.kind === "percent" ? t("percentOff", { n: Number(x.percent_off) }) : t("fixedPrices")}
                  {" · "}{t("customersCount", { n: Number(x.customers) })}
                  {Number(x.fixed_prices) > 0 ? ` · ${t("fixedCount", { n: Number(x.fixed_prices) })}` : ""}
                </div>
              </div>
              {x.key !== "regular" && <Link className="btn-secondary btn-sm" href={`/staff/pricing/${x.id}`}>{t("productPrices")}</Link>}
            </div>
            {x.key !== "regular" && (
              <details className="mt-3 border-t border-brown/10 pt-3">
                <summary className="cursor-pointer text-sm font-semibold text-sunny">{t("editTier")}</summary>
                <div className="mt-3"><TierForm tier={{ ...x, id: String(x.id) }} /></div>
              </details>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
