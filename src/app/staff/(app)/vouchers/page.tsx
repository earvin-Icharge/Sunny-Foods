import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { date, peso } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { PauseButton } from "./VoucherButtons";

export const metadata = { title: "Vouchers" };

export default async function VouchersPage({ searchParams }: PageProps<"/staff/vouchers">) {
  const user = await requirePerm("internal", "vouchers");
  const t = await getTranslations("vouchers");
  const locale = await getLocale();
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const rows = await readAs(user, (tx) => tx`
    select v.*, coalesce(r.uses, 0) as uses, coalesce(r.total, 0) as given,
      case when v.total_limit is not null then greatest(v.total_limit - coalesce(r.uses, 0), 0) end as remaining,
      case when v.end_at is not null then ceil(extract(epoch from (v.end_at - now())) / 86400)::int end as days_left
    from app.vouchers v
    left join (select voucher_id, count(*)::int as uses, sum(amount) as total from app.voucher_redemptions
               where status = 'active' and deleted_at is null group by voucher_id) r on r.voucher_id = v.id
    where v.deleted_at is null and ((${archived} and v.archived_at is not null) or (not ${archived} and v.archived_at is null))
    order by v.active desc, v.created_at desc`);
  const canManage = can(user.perms, "vouchers", 5);
  return (
    <>
      <PageHeader title={t("title")} actions={<>
        <Link className="btn-secondary" href={archived ? "/staff/vouchers" : "/staff/vouchers?archived=1"}>{archived ? t("showCurrent") : t("showArchived")}</Link>
        {canManage && <Link className="btn-primary" href="/staff/vouchers/new">+ {t("add")}</Link>}
      </>} />
      {rows.length === 0 ? <Empty>{t("none")}</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((v) => {
            const expired = v.end_at && (v.days_left as number) < 0;
            const state = v.archived_at ? "archived" : expired ? "expired" : v.paused ? "paused" : !v.active ? "inactive" : "running";
            return (
              <div key={String(v.id)} className="card">
                <div className="flex items-start gap-3">
                  <Link href={`/staff/vouchers/${v.id}`} className="min-w-0 flex-1">
                    <div className="font-bold">{String(v.name)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      {v.code ? <span className="rounded bg-gold/25 px-2 py-0.5 font-mono font-bold">{String(v.code)}</span> : <span className="rounded bg-cream px-2 py-0.5">{t("automatic")}</span>}
                      <span>{describe(t, v)}</span>
                    </div>
                  </Link>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${state === "running" ? "bg-st-ok/15 text-st-ok" : state === "paused" ? "bg-st-packing/15 text-st-packing" : "bg-brown/10"}`}>{t(`state_${state}`)}</span>
                </div>
                <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
                  <div><dt className="text-xs text-brown/60">{t("timesUsed")}</dt><dd className="font-bold">{Number(v.uses)}</dd></div>
                  <div><dt className="text-xs text-brown/60">{t("discountGiven")}</dt><dd className="font-bold">{peso(v.given as number)}</dd></div>
                  <div><dt className="text-xs text-brown/60">{t("remainingUses")}</dt><dd className="font-bold">{v.remaining === null ? "∞" : Number(v.remaining)}</dd></div>
                  <div><dt className="text-xs text-brown/60">{t("daysLeft")}</dt><dd className="font-bold">{v.end_at ? Math.max(Number(v.days_left), 0) : "∞"}</dd></div>
                </dl>
                <div className="mt-3 flex items-center justify-between text-xs text-brown/60">
                  <span>{date(v.start_at as string, locale)} – {v.end_at ? date(v.end_at as string, locale) : t("noEnd")}</span>
                  {canManage && !v.archived_at && <PauseButton id={String(v.id)} paused={Boolean(v.paused)} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function describe(t: (k: string, v?: Record<string, string | number>) => string, v: Record<string, unknown>) {
  const val = Number(v.value);
  switch (v.type) {
    case "pct_order": return t("d_pct", { n: val }) + (v.max_discount ? ` ${t("upTo", { amount: peso(v.max_discount as number) })}` : "");
    case "fixed_order": return t("d_fixed", { amount: peso(val) });
    case "product_discount": return v.value_kind === "percent" ? t("d_prodPct", { n: val }) : t("d_prodFixed", { amount: peso(val) });
    case "free_delivery": return t("d_freeDelivery");
    case "buy_x_get_y": return t("d_bxgy", { x: Number(v.buy_qty), y: Number(v.get_qty) });
    case "free_item": return t("d_freeItem", { n: Number(v.free_qty ?? 1) });
    default: return "";
  }
}
