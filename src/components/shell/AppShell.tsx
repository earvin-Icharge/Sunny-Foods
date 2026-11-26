import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SessionUser } from "@/lib/auth";
import { AREAS, type Area } from "@/lib/areas";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { ToastProvider } from "@/components/ui/Toast";
import { NotificationBell } from "./NotificationBell";
import { UpdateBanner } from "./UpdateBanner";
import { SampleNotice } from "./SampleNotice";
import { NavLinks, type NavItem } from "./NavLinks";
import { signOut, stopViewAs } from "@/app/actions/common";

/**
 * Layout for all three areas (Spec 5): phone = bottom tab bar, computer = left sidebar.
 */
export async function AppShell({ area, user, nav, children }: { area: Area; user: SessionUser; nav: NavItem[]; children: ReactNode }) {
  const t = await getTranslations("common");
  const prefix = AREAS[area].prefix;
  return (
    <ToastProvider>
      <UpdateBanner />
      <SampleNotice />
      {user.viewAs && (
        <form action={stopViewAs} className="no-print sticky top-0 z-40 flex items-center justify-center gap-3 bg-gold px-4 py-2 text-sm font-bold text-charcoal">
          {t("viewingAs", { name: user.fullName, role: user.roleName })}
          <button className="rounded-lg bg-charcoal px-3 py-1 text-white">{t("stopViewAs")}</button>
        </form>
      )}
      <header className="no-print sticky top-0 z-30 border-b border-brown/10 bg-white text-brown shadow-sm">
        <div className="flex h-20 items-center gap-3 px-4">
          <Link href={prefix} className="flex items-center gap-2">
            <span className="block">
              {/* white top bar (Earvin, 2026-11-26) — phone: stacked logo; tablet / computer: long logo */}
              <Image src="/logo.png" alt="Sunny Foods" width={1200} height={615} priority className="h-16 w-auto md:hidden" />
              <Image src="/logo-wide.png" alt="Sunny Foods" width={1833} height={240} priority className="hidden h-12 w-auto md:block lg:h-16" />
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <NotificationBell userId={user.id} prefix={prefix} />
            <form action={signOut.bind(null, area)} className="hidden sm:block">
              <button className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-cream">{t("signOut")}</button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex">
        <aside className="no-print sticky top-20 hidden h-[calc(100vh-5rem)] w-60 shrink-0 overflow-y-auto border-r border-brown/10 bg-white p-3 md:block">
          <div className="mb-3 rounded-xl bg-cream px-3 py-2 text-sm">
            <div className="font-bold">{user.fullName}</div>
            <div className="text-brown/60">{user.roleName}</div>
          </div>
          <NavLinks items={nav} variant="side" />
          <form action={signOut.bind(null, area)} className="mt-4 sm:hidden">
            <button className="btn-ghost w-full">{t("signOut")}</button>
          </form>
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10">{children}</main>
      </div>
      <NavLinks items={nav} variant="tabs" moreLabel={t("more")} signOutSlot={
        <form action={signOut.bind(null, area)}><button className="btn-ghost w-full">{t("signOut")}</button></form>
      } />
    </ToastProvider>
  );
}
