"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; tab?: boolean; badge?: number | null };

function isActive(path: string, href: string) {
  const root = href.split("/").length <= 2;
  return root ? path === href : path === href || path.startsWith(href + "/");
}

export function NavLinks({ items, variant, moreLabel, signOutSlot }: { items: NavItem[]; variant: "side" | "tabs"; moreLabel?: string; signOutSlot?: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (variant === "side") {
    return (
      <nav className="grid gap-1">
        {items.map((i) => (
          <Link key={i.href} href={i.href}
            className={`flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold ${isActive(path, i.href) ? "bg-sunny text-white" : "text-brown hover:bg-cream"}`}>
            <span className="text-xl">{i.icon}</span><span className="flex-1">{i.label}</span>
            {i.badge ? <span className="rounded-full bg-gold px-2 text-xs font-bold text-charcoal">{i.badge}</span> : null}
          </Link>
        ))}
      </nav>
    );
  }
  const tabs = items.filter((i) => i.tab).slice(0, 4);
  const rest = items.filter((i) => !tabs.includes(i));
  return (
    <>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-brown/10 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((i) => (
          <Link key={i.href} href={i.href} className={`flex min-h-16 flex-col items-center justify-center text-xs font-semibold ${isActive(path, i.href) ? "text-sunny" : "text-brown/70"}`}>
            <span className="text-2xl leading-none">{i.icon}</span>{i.label}
          </Link>
        ))}
        <button onClick={() => setOpen(true)} className="flex min-h-16 flex-col items-center justify-center text-xs font-semibold text-brown/70">
          <span className="text-2xl leading-none">☰</span>{moreLabel}
        </button>
      </nav>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2">
              {rest.map((i) => (
                <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="flex min-h-20 flex-col items-center justify-center rounded-xl bg-cream-light text-center text-sm font-semibold">
                  <span className="text-2xl">{i.icon}</span>{i.label}
                </Link>
              ))}
            </div>
            <div className="mt-4">{signOutSlot}</div>
          </div>
        </div>
      )}
    </>
  );
}
