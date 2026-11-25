import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/perms";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Settings" };

export default async function SettingsMenu() {
  const user = await requirePerm("internal", "settings");
  const t = await getTranslations("settings");
  const items = [
    { href: "/staff/settings/general", icon: "🧮", title: t("general"), text: t("generalText"), show: true },
    { href: "/staff/settings/users", icon: "👤", title: t("users"), text: t("usersText"), show: true },
    { href: "/staff/settings/master-control", icon: "🛡️", title: t("masterControl"), text: t("masterControlText"), show: can(user.perms, "settings", 5) },
    { href: "/staff/settings/data-requests", icon: "🔏", title: t("dataRequests"), text: t("dataRequestsText"), show: can(user.perms, "settings", 5) },
    { href: "/staff/delete-requests", icon: "🗑️", title: t("deleteRequests"), text: t("deleteRequestsText"), show: can(user.perms, "trash") },
    { href: "/staff/settings/changelog", icon: "✨", title: t("whatsNew"), text: t("whatsNewText"), show: true },
  ];
  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid gap-3 sm:grid-cols-2">
        {items.filter((i) => i.show).map((i) => (
          <Link key={i.href} href={i.href} className="card flex gap-4 hover:ring-sunny/40">
            <span className="text-3xl">{i.icon}</span>
            <span><span className="block font-bold">{i.title}</span><span className="text-sm text-brown/70">{i.text}</span></span>
          </Link>
        ))}
      </div>
    </>
  );
}
