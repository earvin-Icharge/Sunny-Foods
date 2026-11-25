import type { ReactNode } from "react";
import Link from "next/link";

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {back && <Link href={back} className="no-print mb-1 inline-block text-sm font-semibold text-sunny">← Back</Link>}
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-brown/70">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card py-10 text-center text-brown/60">{children}</div>;
}

export function Stat({ label, value, tone, href }: { label: ReactNode; value: ReactNode; tone?: "red" | "green" | "orange"; href?: string }) {
  const color = tone === "red" ? "text-st-problem" : tone === "green" ? "text-st-ok" : tone === "orange" ? "text-st-packing" : "text-brown";
  const body = (
    <div className="card h-full">
      <div className="text-sm font-semibold text-brown/60">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
