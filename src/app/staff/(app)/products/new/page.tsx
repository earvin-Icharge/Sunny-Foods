import { getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { fieldOn } from "@/lib/perms";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductForm } from "../ProductForm";

export default async function NewProduct() {
  const user = await requirePerm("internal", "products", 2);
  const t = await getTranslations("products");
  const cats = await readAs(user, (tx) => tx`select id, name from app.categories where deleted_at is null order by sort, name`);
  return (
    <>
      <PageHeader title={t("add")} back="/staff/products" />
      <ProductForm product={null} categories={cats.map((c) => ({ id: String(c.id), name: String(c.name) }))}
        showPrice={fieldOn(user.perms, "price")} showCost={fieldOn(user.perms, "cost")} canEdit />
    </>
  );
}
