import { getLocale, getTranslations } from "next-intl/server";
import { date, peso, qty } from "@/lib/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatusTracker } from "@/components/portal/shared";

export type AgentOrder = { id: string; order_no: string; customer_id: string; customer_name: string; status: string; source: string;
  delivery_date: string | null; created_at: string; payment_status: string; total?: number | null;
  items?: { product_name: string; qty: number; unit: string; line_total: number; is_free: boolean }[] | null };

export async function AgentOrderCard({ o, open }: { o: AgentOrder; open?: boolean }) {
  const t = await getTranslations("agentPortal");
  const locale = await getLocale();
  return (
    <details className="card" open={open}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <b>{o.order_no}</b> · {o.customer_name}
          <div className="text-sm text-brown/60">{date(o.created_at, locale)} · {t("deliveryOn")} {date(o.delivery_date, locale)} · {t(`source_${o.source}`)}</div>
        </div>
        {o.total !== null && o.total !== undefined && <b>{peso(o.total)}</b>}
        <StatusBadge status={o.status} /><StatusBadge kind="payment" status={o.payment_status} />
      </summary>
      <div className="mt-4"><StatusTracker status={o.status} /></div>
      {o.items && (
        <ul className="mt-3 grid gap-1 text-sm">
          {o.items.map((i, k) => <li key={k} className="flex justify-between"><span>{i.product_name} × {qty(i.qty)} {i.unit}{i.is_free ? " 🎁" : ""}</span><span>{peso(i.line_total)}</span></li>)}
        </ul>
      )}
    </details>
  );
}
