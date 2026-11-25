"use server";
import { runAction, UserError } from "@/lib/actions";
import { uploadFile } from "@/lib/storage";

function str(fd: FormData, k: string) { const v = fd.get(k); return v === null || v === "" ? null : String(v); }
function num(fd: FormData, k: string) { const v = str(fd, k); return v === null ? null : Number(v); }

/** Create or update a product (Spec 7.2). Price/cost only saved when the user may see them. */
export async function saveProduct(id: string | null, fd: FormData) {
  return runAction({ area: "internal", module: "products", level: id ? 3 : 2, revalidate: ["/staff/products"], audit: { table: "products", id: (d: string) => d } }, async (tx, u) => {
    const photo = fd.get("photo") as File | null;
    const packPhoto = fd.get("packing_photo") as File | null;
    const photoPath = photo && photo.size > 0 ? await uploadFile(photo, "products", { public: true }) : undefined;
    const packPath = packPhoto && packPhoto.size > 0 ? await uploadFile(packPhoto, "packing", { public: true }) : undefined;
    const row: Record<string, unknown> = {
      sku: str(fd, "sku"), name: str(fd, "name"), name_zh_hans: str(fd, "name_zh_hans"), name_zh_hant: str(fd, "name_zh_hant"), name_tl: str(fd, "name_tl"),
      description: str(fd, "description"), category_id: str(fd, "category_id"), unit: str(fd, "unit") ?? "pack",
      pack_weight_g: num(fd, "pack_weight_g"), low_stock_level: num(fd, "low_stock_level") ?? 0,
      storage: str(fd, "storage") ?? "frozen", vat_type: str(fd, "vat_type") ?? "vatable", active: fd.get("active") === "on",
      packing_instruction: str(fd, "packing_instruction"), packing_instruction_zh_hans: str(fd, "packing_instruction_zh_hans"),
      packing_instruction_zh_hant: str(fd, "packing_instruction_zh_hant"), packing_instruction_tl: str(fd, "packing_instruction_tl"),
    };
    if (!row.sku || !row.name) throw new UserError("SKU and name are required.");
    if (u.perms.fields.price === "on" && fd.has("default_price")) row.default_price = num(fd, "default_price") ?? 0;
    if (u.perms.fields.cost === "on" && fd.has("cost")) row.cost = num(fd, "cost");
    if (photoPath) row.photo_path = photoPath;
    if (packPath) row.packing_photo_path = packPath;
    if (id) {
      await tx`update app.products set ${tx(row)} where id = ${id}`;
      return id;
    }
    const [r] = await tx`insert into app.products ${tx(row)} returning id`;
    return String(r.id);
  });
}

export async function setArchived(id: string, archived: boolean) {
  return runAction({ area: "internal", module: "products", level: 3, revalidate: ["/staff/products"], audit: { table: "products", id: () => id } }, async (tx) => {
    await tx`update app.products set archived_at = ${archived ? new Date() : null}, active = ${!archived} where id = ${id}`;
    return id;
  });
}

/** Packaging recipe line (materials per 1 unit sold). */
export async function saveRecipeLine(productId: string, materialId: string, qtyPerUnit: number) {
  return runAction({ area: "internal", module: "products", level: 3, revalidate: [`/staff/products/${productId}`] }, async (tx) => {
    if (!(qtyPerUnit > 0)) throw new UserError("Quantity must be more than 0.");
    const [ex] = await tx`select id from app.product_packaging where product_id = ${productId} and material_id = ${materialId} and deleted_at is null`;
    if (ex) await tx`update app.product_packaging set qty_per_unit = ${qtyPerUnit} where id = ${ex.id as string}`;
    else await tx`insert into app.product_packaging (product_id, material_id, qty_per_unit) values (${productId}, ${materialId}, ${qtyPerUnit})`;
    return null;
  });
}

export async function removeRecipeLine(lineId: string) {
  return runAction({ area: "internal", module: "products", level: 3, revalidate: ["/staff/products"] }, async (tx) => {
    await tx`update app.product_packaging set deleted_at = now() where id = ${lineId}`;
    return null;
  });
}

export async function saveMaterial(id: string | null, fd: FormData) {
  return runAction({ area: "internal", module: "products", level: id ? 3 : 2, revalidate: ["/staff/products/materials"] }, async (tx, u) => {
    const photo = fd.get("photo") as File | null;
    const row: Record<string, unknown> = {
      code: str(fd, "code"), name: str(fd, "name"), name_zh_hans: str(fd, "name_zh_hans"), name_zh_hant: str(fd, "name_zh_hant"),
      name_tl: str(fd, "name_tl"), unit: str(fd, "unit") ?? "pc", low_stock_level: num(fd, "low_stock_level") ?? 0, active: fd.get("active") !== "off",
    };
    if (!row.code || !row.name) throw new UserError("Code and name are required.");
    if (u.perms.fields.cost === "on" && fd.has("cost")) row.cost = num(fd, "cost");
    if (photo && photo.size > 0) row.photo_path = await uploadFile(photo, "materials", { public: true });
    if (id) { await tx`update app.packaging_materials set ${tx(row)} where id = ${id}`; return id; }
    const [r] = await tx`insert into app.packaging_materials ${tx(row)} returning id`;
    return String(r.id);
  });
}

export async function saveCategory(id: string | null, fd: FormData) {
  return runAction({ area: "internal", module: "products", level: id ? 3 : 2, revalidate: ["/staff/products"] }, async (tx) => {
    const row = {
      name: str(fd, "name"), name_zh_hans: str(fd, "name_zh_hans"), name_zh_hant: str(fd, "name_zh_hant"), name_tl: str(fd, "name_tl"),
      sort: num(fd, "sort") ?? 100, vat_type: str(fd, "vat_type") ?? "vatable",
    };
    if (!row.name) throw new UserError("Name is required.");
    if (id) { await tx`update app.categories set ${tx(row)} where id = ${id}`; return id; }
    const [r] = await tx`insert into app.categories ${tx(row)} returning id`;
    return String(r.id);
  });
}
