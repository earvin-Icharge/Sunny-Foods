import Link from "next/link";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { localName, peso, qty } from "@/lib/format";
import { publicUrl } from "@/lib/storage";
import { PageHeader, Empty } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/staff/products">) {
  const user = await requirePerm("internal", "products");
  const t = await getTranslations("products");
  const locale = await getLocale();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const showArchived = sp.archived === "1";
  const rows = await readAs(user, (tx) => tx`
    select * from app.v_products
    where deleted_at is null and (${showArchived} or archived_at is null)
      and (${q} = '' or name ilike ${"%" + q + "%"} or sku ilike ${"%" + q + "%"})
    order by category_name nulls last, name`);
  return (
    <>
      <PageHeader title={t("title")} actions={<>
        <Link className="btn-secondary" href="/staff/products/categories">{t("categories")}</Link>
        <Link className="btn-secondary" href="/staff/products/materials">{t("materials")}</Link>
        {can(user.perms, "products", 2) && <Link className="btn-primary" href="/staff/products/new">+ {t("add")}</Link>}
      </>} />
      <form className="mb-4 flex gap-2">
        <input className="input" name="q" defaultValue={q} placeholder={t("search")} />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" name="archived" value="1" defaultChecked={showArchived} /> {t("showArchived")}</label>
        <button className="btn-secondary">{t("searchButton")}</button>
      </form>
      {rows.length === 0 ? <Empty>{t("none")}</Empty> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const photo = publicUrl(p.photo_path as string | null);
            return (
              <Link key={String(p.id)} href={`/staff/products/${p.id}`} className="card flex gap-3 hover:ring-sunny/40">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-cream">
                  {photo ? <Image src={photo} alt="" fill sizes="80px" className="object-cover" /> : <span className="flex h-full items-center justify-center text-3xl">🥩</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{localName(p, locale)}</div>
                  <div className="text-xs text-brown/60">{String(p.sku)} · {localName(p, locale, "category_name")}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    {fieldOn(user.perms, "price") && <span className="font-semibold">{peso(p.default_price as number)}</span>}
                    {fieldOn(user.perms, "stock_qty") ? <span>{t("stock")}: {qty(p.stock_qty as number)}</span> : <StatusBadge kind="stock" status={String(p.stock_badge)} />}
                    {p.vat_type === "exempt" && <span className="rounded bg-gold/20 px-2 text-xs">{t("vatExempt")}</span>}
                    {p.archived_at ? <span className="rounded bg-brown/10 px-2 text-xs">{t("archived")}</span> : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
