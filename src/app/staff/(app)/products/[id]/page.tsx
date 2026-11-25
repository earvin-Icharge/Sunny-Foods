import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can, fieldOn } from "@/lib/perms";
import { localName } from "@/lib/format";
import { publicUrl } from "@/lib/storage";
import { PageHeader } from "@/components/ui/PageHeader";
import { AuditHistory } from "@/components/ui/AuditHistory";
import { ConfirmDelete } from "@/components/ui/ConfirmDelete";
import { ProductForm } from "../ProductForm";
import { RecipeEditor } from "./RecipeEditor";
import { ArchiveButton } from "./ArchiveButton";

export default async function ProductPage({ params }: PageProps<"/staff/products/[id]">) {
  const { id } = await params;
  const user = await requirePerm("internal", "products");
  const t = await getTranslations("products");
  const locale = await getLocale();
  const data = await readAs(user, async (tx) => {
    const [p] = await tx`select * from app.v_products where id = ${id}`;
    if (!p) return null;
    const cats = await tx`select id, name from app.categories where deleted_at is null order by sort, name`;
    const recipe = await tx`select pp.id, pp.material_id, pp.qty_per_unit, m.name, m.name_zh_hans, m.name_zh_hant, m.name_tl, m.unit
      from app.product_packaging pp join app.packaging_materials m on m.id = pp.material_id
      where pp.product_id = ${id} and pp.deleted_at is null order by m.name`;
    const materials = await tx`select id, name, unit from app.packaging_materials where deleted_at is null and active order by name`;
    return { p, cats, recipe, materials };
  });
  if (!data) notFound();
  const { p } = data;
  const canEdit = can(user.perms, "products", 3);
  return (
    <>
      <PageHeader title={localName(p, locale)} subtitle={String(p.sku)} back="/staff/products" actions={canEdit && <>
        <ArchiveButton id={id} archived={Boolean(p.archived_at)} />
        {can(user.perms, "products", 4) && <ConfirmDelete table="products" id={id} name={String(p.name)} />}
      </>} />
      <ProductForm product={p} categories={data.cats.map((c) => ({ id: String(c.id), name: String(c.name) }))}
        showPrice={fieldOn(user.perms, "price")} showCost={fieldOn(user.perms, "cost")} canEdit={canEdit}
        photoUrl={publicUrl(p.photo_path as string)} packingPhotoUrl={publicUrl(p.packing_photo_path as string)} />
      <h2 className="mb-3 mt-8 text-xl font-bold">{t("recipe")}</h2>
      <p className="mb-3 text-sm text-brown/70">{t("recipeHelp")}</p>
      <RecipeEditor productId={id} canEdit={canEdit}
        lines={data.recipe.map((r) => ({ id: String(r.id), materialId: String(r.material_id), name: localName(r, locale), unit: String(r.unit), qty: Number(r.qty_per_unit) }))}
        materials={data.materials.map((m) => ({ id: String(m.id), name: String(m.name), unit: String(m.unit) }))} />
      <AuditHistory user={user} table="products" id={id} />
    </>
  );
}
