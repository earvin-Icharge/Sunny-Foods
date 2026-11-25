"use server";
import { runAction, UserError } from "@/lib/actions";

function str(fd: FormData, k: string) { const v = fd.get(k); return v === null || String(v).trim() === "" ? null : String(v).trim(); }

/** Price tier: % off regular OR fixed price per product (boss only, Spec 7.11). */
export async function saveTier(id: string | null, fd: FormData) {
  return runAction({ area: "internal", module: "customers", level: 5, revalidate: ["/staff/pricing"], audit: { table: "price_tiers", id: (d: string) => d } }, async (tx) => {
    const name = str(fd, "name");
    if (!name) throw new UserError("Name is required.");
    const kind = str(fd, "kind") === "fixed" ? "fixed" : "percent";
    const pct = Number(str(fd, "percent_off") ?? 0);
    if (kind === "percent" && !(pct >= 0 && pct <= 100)) throw new UserError("Percent must be 0–100.");
    const row = { name, kind, percent_off: kind === "percent" ? pct : 0, active: fd.get("active") !== "off" };
    if (id) {
      await tx`update app.price_tiers set ${tx(row)} where id = ${id}`;
      return id;
    }
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) + "_" + Date.now().toString(36).slice(-4);
    const [r] = await tx`insert into app.price_tiers ${tx({ ...row, key })} returning id`;
    return String(r.id);
  });
}

export async function setTierPrice(tierId: string, productId: string, price: number | null) {
  return runAction({ area: "internal", module: "customers", level: 5, revalidate: [`/staff/pricing/${tierId}`] }, async (tx) => {
    const [ex] = await tx`select id from app.tier_prices where tier_id = ${tierId} and product_id = ${productId} and deleted_at is null`;
    if (price === null) {
      if (ex) await tx`update app.tier_prices set deleted_at = now() where id = ${ex.id as string}`;
      return null;
    }
    if (!(price >= 0)) throw new UserError("Enter a valid price.");
    if (ex) await tx`update app.tier_prices set price = ${price} where id = ${ex.id as string}`;
    else await tx`insert into app.tier_prices (tier_id, product_id, price) values (${tierId}, ${productId}, ${price})`;
    return null;
  });
}
