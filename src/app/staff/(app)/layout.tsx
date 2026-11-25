import { getTranslations } from "next-intl/server";
import { requireArea } from "@/lib/auth";
import { can } from "@/lib/perms";
import { AppShell } from "@/components/shell/AppShell";
import type { NavItem } from "@/components/shell/NavLinks";

// Internal app (staff) — app.sunnyfoods.com.ph. Menu shows only what the role may open.
export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const user = await requireArea("internal");
  const t = await getTranslations("nav");
  const p = user.perms;
  const isDriver = p.modules.deliveries?.scope === "own";
  const nav: NavItem[] = [
    { href: "/staff", label: t("dashboard"), icon: "🏠", tab: true },
    can(p, "orders") && !isDriver && { href: "/staff/orders", label: t("orders"), icon: "🧾", tab: true },
    can(p, "packing") && { href: "/staff/packing", label: t("packing"), icon: "📦", tab: true },
    can(p, "deliveries") && { href: "/staff/deliveries", label: t("deliveries"), icon: "🚚", tab: true },
    can(p, "payments") && !isDriver && { href: "/staff/payments", label: t("payments"), icon: "💳" },
    can(p, "customers") && { href: "/staff/customers", label: t("customers"), icon: "👥", tab: !can(p, "packing") },
    can(p, "products") && { href: "/staff/products", label: t("products"), icon: "🥩" },
    can(p, "inventory") && { href: "/staff/inventory", label: t("inventory"), icon: "❄️", tab: !can(p, "orders") },
    can(p, "vouchers") && { href: "/staff/vouchers", label: t("vouchers"), icon: "🎟️" },
    can(p, "customers", 5) && { href: "/staff/pricing", label: t("pricing"), icon: "🏷️" },
    can(p, "agents") && { href: "/staff/agents", label: t("agents"), icon: "🤝" },
    can(p, "reports") && { href: "/staff/reports", label: t("reports"), icon: "📊" },
    can(p, "trash") && { href: "/staff/trash", label: t("trash"), icon: "🗑️" },
    can(p, "settings") && { href: "/staff/settings", label: t("settings"), icon: "⚙️" },
  ].filter(Boolean) as NavItem[];
  return <AppShell area="internal" user={user} nav={nav}>{children}</AppShell>;
}
