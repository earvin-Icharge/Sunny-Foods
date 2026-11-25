import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { CategoryForm } from "./CategoryForm";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requirePerm("internal", "products");
  const t = await getTranslations("products");
  const rows = await readAs(user, (tx) => tx`
    select c.*, (select count(*)::int from app.products p where p.category_id = c.id and p.deleted_at is null) as n
    from app.categories c where c.deleted_at is null order by sort, name`);
  return (
    <>
      <PageHeader title={t("categories")} back="/staff/products" />
      {can(user.perms, "products", 2) && (
        <details className="card mb-4">
          <summary className="cursor-pointer font-bold">+ {t("addCategory")}</summary>
          <div className="mt-3"><CategoryForm category={null} /></div>
        </details>
      )}
      <div className="grid gap-3">
        {rows.map((c) => (
          <details key={String(c.id)} className="card">
            <summary className="flex cursor-pointer items-center gap-3">
              <b className="flex-1">{String(c.name)}</b>
              {c.vat_type === "exempt" && <span className="rounded bg-gold/20 px-2 text-xs">{t("vatExempt")}</span>}
              <span className="text-sm text-brown/60">{t("productCount", { n: Number(c.n) })}</span>
            </summary>
            {can(user.perms, "products", 3) && (
              <div className="mt-4 border-t border-brown/10 pt-4">
                <CategoryForm category={{ ...c, id: String(c.id) }} />
                {can(user.perms, "products", 4) && Number(c.n) === 0 && <div className="mt-3"><ConfirmDelete table="categories" id={String(c.id)} name={String(c.name)} /></div>}
              </div>
            )}
          </details>
        ))}
      </div>
    </>
  );
}
