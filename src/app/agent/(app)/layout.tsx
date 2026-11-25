import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/AppShell";
import type { NavItem } from "@/components/shell/NavLinks";
import { signOut } from "@/app/actions/common";
import { getAgentCtx } from "./agent-context";

// Agent portal — agent.sunnyfoods.com.ph (Spec 7.14).
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAgentCtx();
  const t = await getTranslations("nav");
  const ta = await getTranslations("agentPortal");
  if (!ctx.agent || ctx.agent.portal_locked_at) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-5xl">🔒</div>
        <h1 className="text-2xl font-bold">{ta("lockedTitle")}</h1>
        <p className="text-brown/70">{ta("lockedText")}</p>
        <form action={signOut.bind(null, "agent")}><button className="btn-primary">{ta("signOut")}</button></form>
      </main>
    );
  }
  const nav: NavItem[] = [
    { href: "/agent", label: t("dashboard"), icon: "🏠", tab: true },
    { href: "/agent/customers", label: t("myCustomers"), icon: "👥", tab: true },
    { href: "/agent/orders", label: t("orders"), icon: "🧾", tab: true },
    ctx.canOrder && { href: "/agent/new-order", label: ta("newOrder"), icon: "➕", tab: true },
    { href: "/agent/commissions", label: t("commissions"), icon: "💰", tab: !ctx.canOrder },
    { href: "/agent/payouts", label: t("payouts"), icon: "🏦" },
    ctx.canRefer && { href: "/agent/invite", label: t("invite"), icon: "📨" },
  ].filter(Boolean) as NavItem[];
  return (
    <AppShell area="agent" user={ctx.user} nav={nav}>
      {ctx.readOnly && <div className="mb-4 rounded-xl bg-gold/20 p-3 text-sm font-semibold">{ta("readOnlyBanner")}</div>}
      {children}
    </AppShell>
  );
}
