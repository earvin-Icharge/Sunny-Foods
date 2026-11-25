import { getTranslations } from "next-intl/server";
import { requireArea } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";
import type { NavItem } from "@/components/shell/NavLinks";

// Customer portal — order.sunnyfoods.com.ph (Spec 7.10). Customers never see internal pages.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireArea("portal");
  const t = await getTranslations("nav");
  const tp = await getTranslations("portal");
  const nav: NavItem[] = [
    { href: "/portal", label: t("catalog"), icon: "🛍️", tab: true },
    { href: "/portal/cart", label: t("cart"), icon: "🛒", tab: true },
    { href: "/portal/orders", label: t("myOrders"), icon: "🧾", tab: true },
    { href: "/portal/account", label: t("account"), icon: "👤", tab: true },
  ];
  return (
    <AppShell area="portal" user={user} nav={nav}>
      {user.customerId ? children : <div className="card py-10 text-center">{tp("accountNotReady")}</div>}
    </AppShell>
  );
}
