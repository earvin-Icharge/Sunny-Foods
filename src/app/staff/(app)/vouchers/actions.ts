"use server";
import { runAction, UserError } from "@/lib/actions";

function str(fd: FormData, k: string) { const v = fd.get(k); return v === null || String(v).trim() === "" ? null : String(v).trim(); }
function num(fd: FormData, k: string) { const v = str(fd, k); return v === null ? null : Number(v); }
function manila(v: string | null) { return v ? new Date(v.length === 16 ? `${v}:00+08:00` : v) : null; }

const TYPES = ["pct_order", "fixed_order", "product_discount", "free_delivery", "buy_x_get_y", "free_item"];
const AUDIENCES = ["all", "selected", "tier", "first_order", "employees"];

/** Voucher builder (Spec 7.12): all 6 types + rules. Boss only (vouchers level 5). */
export async function saveVoucher(id: string | null, fd: FormData) {
  return runAction({ area: "internal", module: "vouchers", level: 5, revalidate: ["/staff/vouchers"], audit: { table: "vouchers", id: (d: string) => d } }, async (tx) => {
    const type = str(fd, "type") ?? "pct_order";
    const audience = str(fd, "audience") ?? "all";
    if (!TYPES.includes(type) || !AUDIENCES.includes(audience)) throw new UserError("Invalid voucher type.");
    const automatic = fd.get("automatic") === "on";
    const code = automatic ? null : str(fd, "code")?.toUpperCase().replace(/\s+/g, "") ?? null;
    if (!automatic && !code) throw new UserError("Enter a code or choose Automatic.");
    const row: Record<string, unknown> = {
      name: str(fd, "name"), code, type, value: num(fd, "value") ?? 0, value_kind: str(fd, "value_kind") ?? "percent",
      max_discount: num(fd, "max_discount"), min_order: num(fd, "min_order") ?? 0,
      start_at: manila(str(fd, "start_at")) ?? new Date(), end_at: manila(str(fd, "end_at")),
      active: fd.get("active") === "on", audience, tier_id: audience === "tier" ? str(fd, "tier_id") : null,
      employees_allowed: fd.get("employees_allowed") === "on", total_limit: num(fd, "total_limit"), per_customer_limit: num(fd, "per_customer_limit"),
      stackable: fd.get("stackable") === "on",
      buy_product_id: type === "buy_x_get_y" ? str(fd, "buy_product_id") : null, buy_qty: type === "buy_x_get_y" ? num(fd, "buy_qty") : null,
      get_product_id: type === "buy_x_get_y" ? str(fd, "get_product_id") : null, get_qty: type === "buy_x_get_y" ? num(fd, "get_qty") : null,
      free_product_id: type === "free_item" ? str(fd, "free_product_id") : null, free_qty: type === "free_item" ? num(fd, "free_qty") : null,
    };
    if (!row.name) throw new UserError("Name is required.");
    if (type === "pct_order" && !((row.value as number) > 0 && (row.value as number) <= 100)) throw new UserError("Percent must be 1–100.");
    if (["fixed_order", "product_discount"].includes(type) && !((row.value as number) > 0)) throw new UserError("Enter the discount value.");
    if (type === "buy_x_get_y" && (!row.buy_product_id || !row.buy_qty || !row.get_qty)) throw new UserError("Choose the product to buy, how many, and how many free.");
    if (type === "free_item" && !row.free_product_id) throw new UserError("Choose the free product.");
    if (row.tier_id === null && audience === "tier") throw new UserError("Choose the price list.");
    if (row.end_at && row.end_at < (row.start_at as Date)) throw new UserError("End date is before start date.");

    let vid = id;
    if (id) await tx`update app.vouchers set ${tx(row)} where id = ${id}`;
    else { const [r] = await tx`insert into app.vouchers ${tx(row)} returning id`; vid = String(r.id); }

    // targets: customers (audience selected) + products/categories (type 3)
    await tx`update app.voucher_targets set deleted_at = now() where voucher_id = ${vid} and deleted_at is null`;
    const targets: { voucher_id: string; target_type: string; target_id: string }[] = [];
    if (audience === "selected") for (const c of fd.getAll("customer_ids")) targets.push({ voucher_id: vid!, target_type: "customer", target_id: String(c) });
    if (type === "product_discount") {
      for (const p of fd.getAll("product_ids")) targets.push({ voucher_id: vid!, target_type: "product", target_id: String(p) });
      for (const c of fd.getAll("category_ids")) targets.push({ voucher_id: vid!, target_type: "category", target_id: String(c) });
      if (!targets.some((x) => x.target_type !== "customer")) throw new UserError("Choose at least one product or category.");
    }
    if (audience === "selected" && !targets.some((x) => x.target_type === "customer")) throw new UserError("Choose at least one customer.");
    if (targets.length) await tx`insert into app.voucher_targets ${tx(targets)}`;
    return vid!;
  });
}

export async function setPaused(id: string, paused: boolean) {
  return runAction({ area: "internal", module: "vouchers", level: 5, revalidate: ["/staff/vouchers"], audit: { table: "vouchers", id: () => id } }, async (tx) => {
    await tx`update app.vouchers set paused = ${paused} where id = ${id}`;
    return id;
  });
}

/** Vouchers are archived, never hard-deleted (old orders keep showing them). */
export async function setArchived(id: string, archived: boolean) {
  return runAction({ area: "internal", module: "vouchers", level: 5, revalidate: ["/staff/vouchers"], audit: { table: "vouchers", id: () => id } }, async (tx) => {
    await tx`update app.vouchers set archived_at = ${archived ? new Date() : null}, active = ${!archived} where id = ${id}`;
    return id;
  });
}
