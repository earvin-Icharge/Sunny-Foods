"use server";
import { runAction, UserError } from "@/lib/actions";
import { uploadFile } from "@/lib/storage";

export type OrderInput = {
  customer_id: string;
  items: { product_id: string; qty: number }[];
  delivery_method: string;
  courier_name?: string | null;
  delivery_date?: string | null;
  time_window?: string | null;
  address_id?: string | null;
  payment_method?: string | null;
  voucher_code?: string | null;
  manual_discount?: { amount: number; reason: string | null } | null;
  notes?: string | null;
  internal_notes?: string | null;
  confirm_now?: boolean;
  change_note?: string | null;
};

type Quote = Record<string, unknown> & { errors?: { code: string }[]; lines?: Record<string, unknown>[] };

/** Live price breakdown while encoding (database calculates; nothing is saved). */
export async function quoteOrder(input: OrderInput, orderId?: string | null) {
  return runAction({ area: "internal", module: "orders", level: 2 }, async (tx, u) => {
    const p = { ...input, order_id: orderId ?? null };
    const [r] = await tx`select app.quote_order(${JSON.stringify(p)}::jsonb) as q`;
    const q = r.q as Quote;
    if (u.perms.fields.price !== "on") {
      // never send prices to someone who may not see them
      return { ok: q.ok, errors: q.errors, warnings: q.warnings, voucher: q.voucher, hidden: true } as Quote;
    }
    return q;
  });
}

/** Place a staff order (source = Staff). Returns {ok, order_id} or {ok:false, errors}. */
export async function placeOrder(input: OrderInput) {
  return runAction({ area: "internal", module: "orders", level: 2, revalidate: ["/staff/orders"] }, async (tx) => {
    if (input.manual_discount && input.manual_discount.amount > 0 && !input.manual_discount.reason?.trim()) {
      return { ok: false, errors: [{ code: "manual_discount_reason_required" }] };
    }
    const [r] = await tx`select app.place_order(${JSON.stringify(input)}::jsonb) as r`;
    const res = r.r as { ok: boolean; order_id?: string; order_no?: string; errors?: { code: string }[] };
    return { ok: res.ok, order_id: res.order_id, order_no: res.order_no, errors: res.errors ?? [] };
  });
}

/** Staff edit while New/Confirmed — customer is notified (Spec 7.5). */
export async function editOrder(orderId: string, input: OrderInput) {
  return runAction({ area: "internal", module: "orders", level: 3, revalidate: [`/staff/orders/${orderId}`] }, async (tx) => {
    const p: Record<string, unknown> = { ...input };
    if (!input.voucher_code) delete p.voucher_code;
    const [r] = await tx`select app.edit_order(${orderId}::uuid, ${JSON.stringify(p)}::jsonb) as r`;
    const res = r.r as { ok: boolean; errors?: { code: string }[] };
    return { ok: res.ok, errors: res.errors ?? [] };
  });
}

export async function setOrderStatus(orderId: string, status: string, reason?: string | null) {
  return runAction({ area: "internal", revalidate: ["/staff/orders", `/staff/orders/${orderId}`], audit: { table: "orders", id: () => orderId } }, async (tx) => {
    if (status === "cancelled" && !reason?.trim()) throw new UserError("A reason is required to cancel.");
    await tx`select app.set_order_status(${orderId}::uuid, ${status}, ${reason ?? null})`;
    return orderId;
  });
}

export async function assignDriver(orderId: string, driverId: string, date: string) {
  return runAction({ area: "internal", module: "deliveries", level: 3, revalidate: [`/staff/orders/${orderId}`, "/staff/deliveries"] }, async (tx) => {
    if (!driverId) throw new UserError("Choose a driver.");
    await tx`select app.assign_delivery(${orderId}::uuid, ${driverId}::uuid, ${date || null}::date)`;
    return null;
  });
}

export async function recordPayment(orderId: string, fd: FormData) {
  return runAction({ area: "internal", module: "payments", level: 2, revalidate: [`/staff/orders/${orderId}`, "/staff/payments"] }, async (tx) => {
    const amount = Number(fd.get("amount"));
    if (!(amount > 0)) throw new UserError("Enter the amount paid.");
    const method = String(fd.get("method") || "cash");
    const proof = fd.get("proof") as File | null;
    const proofPath = proof && proof.size > 0 ? await uploadFile(proof, `payments/${orderId}`) : null;
    const [r] = await tx`select app.record_payment(${orderId}::uuid, ${amount}, ${method}, ${(fd.get("paid_at") as string) || null}::date,
      ${(fd.get("reference") as string) || null}, ${proofPath}, ${(fd.get("notes") as string) || null}) as id`;
    return String(r.id);
  });
}

export async function saveBirInvoice(orderId: string, invoiceNo: string) {
  return runAction({ area: "internal", module: "orders", level: 3, revalidate: [`/staff/orders/${orderId}`], audit: { table: "orders", id: () => orderId } }, async (tx) => {
    await tx`update app.orders set bir_invoice_no = ${invoiceNo.trim() || null} where id = ${orderId}`;
    return orderId;
  });
}

/** Details needed when a customer is picked on the order form. */
export async function customerOptions(customerId: string) {
  return runAction({ area: "internal", module: "orders", level: 2 }, async (tx) => {
    const [c] = await tx`select id, name, default_delivery_method, payment_terms, allowed_payment_methods, status, is_employee_account
      from app.v_customers where id = ${customerId}`;
    if (!c) throw new UserError("Customer not found.");
    const addresses = await tx`select id, label, address, is_default from app.customer_addresses
      where customer_id = ${customerId} and deleted_at is null order by is_default desc, label`;
    return {
      customer: { id: String(c.id), name: String(c.name), default_delivery_method: String(c.default_delivery_method), payment_terms: String(c.payment_terms),
        allowed_payment_methods: (c.allowed_payment_methods as string[]) ?? [], status: String(c.status), is_employee_account: Boolean(c.is_employee_account) },
      addresses: addresses.map((a) => ({ id: String(a.id), label: String(a.label), address: String(a.address), is_default: Boolean(a.is_default) })),
    };
  });
}
