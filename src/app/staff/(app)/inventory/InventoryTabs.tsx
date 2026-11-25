import Link from "next/link";
import { getTranslations } from "next-intl/server";

const TABS = [
  { href: "/staff/inventory", key: "tabStock" },
  { href: "/staff/inventory/batches", key: "tabBatches" },
  { href: "/staff/inventory/stock-in", key: "tabStockIn" },
  { href: "/staff/inventory/adjust", key: "tabAdjust" },
  { href: "/staff/inventory/movements", key: "tabMovements" },
  { href: "/staff/inventory/counts", key: "tabCounts" },
];

export async function InventoryTabs({ active }: { active: string }) {
  const t = await getTranslations("inventory");
  return (
    <nav className="no-print -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {TABS.map((x) => (
        <Link key={x.href} href={x.href} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${active === x.href ? "bg-sunny text-white" : "bg-white text-brown ring-1 ring-brown/10"}`}>
          {t(x.key)}
        </Link>
      ))}
    </nav>
  );
}
