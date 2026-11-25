"use server";
import { runAction, UserError } from "@/lib/actions";

function str(fd: FormData, k: string) { const v = fd.get(k); return v === null || v === "" ? null : String(v); }

/** Stock In by batch (Spec 7.3). */
export async function stockIn(fd: FormData) {
  return runAction({ area: "internal", module: "inventory", level: 2, revalidate: ["/staff/inventory"] }, async (tx) => {
    const type = str(fd, "item_type") ?? "product";
    const item = str(fd, "item_id");
    const qty = Number(str(fd, "qty"));
    if (!item) throw new UserError("Choose the item.");
    if (!(qty > 0)) throw new UserError("Quantity must be more than 0.");
    const batchNo = str(fd, "batch_no") ?? `B${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`;
    const [r] = await tx`select app.stock_in(${type}, ${item}::uuid, ${batchNo}, ${str(fd, "production_date")}::date,
      ${str(fd, "expiry_date")}::date, ${str(fd, "location")}, ${qty}, ${str(fd, "notes")}) as id`;
    return String(r.id);
  });
}

/** Adjustment / Spoilage / Return — reason required; big adjustments wait for the boss. */
export async function adjustStock(fd: FormData) {
  return runAction({ area: "internal", module: "inventory", level: 2, revalidate: ["/staff/inventory"] }, async (tx) => {
    const type = str(fd, "item_type") ?? "product";
    const item = str(fd, "item_id");
    const kind = str(fd, "kind") ?? "adjustment";
    let qty = Number(str(fd, "qty"));
    const reason = str(fd, "reason");
    if (!item) throw new UserError("Choose the item.");
    if (!(qty > 0)) throw new UserError("Quantity must be more than 0.");
    if (!reason) throw new UserError("A reason is required.");
    if (kind === "spoilage" || (kind === "adjustment" && str(fd, "direction") === "minus")) qty = -qty;
    const [r] = await tx`select app.adjust_stock(${type}, ${item}::uuid, ${str(fd, "batch_id")}::uuid, ${qty}, ${kind}, ${reason}) as id`;
    const [m] = await tx`select status from app.stock_movements where id = ${r.id as string}`;
    return String(m?.status ?? "posted");
  });
}

export async function decideMovement(id: string, approve: boolean) {
  return runAction({ area: "internal", module: "inventory", level: 5, revalidate: ["/staff/inventory"] }, async (tx) => {
    await tx`select app.decide_stock_movement(${id}::uuid, ${approve})`;
    return null;
  });
}

export async function createCount(notes: string | null) {
  return runAction({ area: "internal", module: "inventory", level: 2, revalidate: ["/staff/inventory/counts"] }, async (tx) => {
    const [r] = await tx`select app.create_stock_count(${notes}) as id`;
    return String(r.id);
  });
}

export async function saveCountLines(countId: string, lines: { id: string; counted: number | null }[], submit: boolean) {
  return runAction({ area: "internal", module: "inventory", level: 2, revalidate: [`/staff/inventory/counts/${countId}`] }, async (tx) => {
    const [c] = await tx`select status from app.stock_counts where id = ${countId}`;
    if (!c || c.status !== "draft") throw new UserError("This count can no longer be changed.");
    for (const l of lines) {
      await tx`update app.stock_count_lines set counted_qty = ${l.counted} where id = ${l.id} and count_id = ${countId}`;
    }
    if (submit) await tx`update app.stock_counts set status = 'submitted' where id = ${countId}`;
    return null;
  });
}

export async function decideCount(countId: string, approve: boolean) {
  return runAction({ area: "internal", module: "inventory", level: 5, revalidate: [`/staff/inventory/counts/${countId}`] }, async (tx) => {
    if (approve) await tx`select app.approve_stock_count(${countId}::uuid)`;
    else await tx`update app.stock_counts set status = 'rejected', approved_by = auth.uid(), approved_at = now() where id = ${countId} and status = 'submitted'`;
    return null;
  });
}
