// Shared permission names (Spec 3a). Safe to import in client components.
export const MODULES = [
  "dashboard", "orders", "customers", "products", "inventory", "packing", "deliveries",
  "payments", "vouchers", "agents", "reports", "trash", "settings",
] as const;
export type Module = (typeof MODULES)[number];

export const LEVELS = ["none", "view", "create", "edit", "request_delete", "approve"] as const;
export const LEVEL = { none: 0, view: 1, create: 2, edit: 3, request_delete: 4, approve: 5 } as const;

export const SENSITIVE_FIELDS = [
  "price", "cost", "stock_qty", "customer_contact", "customer_address", "customer_balance",
  "payment_details", "sales_totals", "other_agents", "commission_rates",
] as const;

export const AGENT_FIELDS = [
  "ag_products", "ag_categories", "ag_prices", "ag_stock", "ag_customer", "ag_orders",
  "ag_commission", "ag_leaderboard", "ag_act_order", "ag_act_refer", "ag_act_voucher", "ag_act_reports",
] as const;

export const FIELDS = [...SENSITIVE_FIELDS, ...AGENT_FIELDS] as const;

export type Perms = {
  modules: Record<Module, { level: number; scope: "own" | "team" | "all" }>;
  fields: Record<string, string>;
};

export function can(perms: Perms, module: Module, level = 1): boolean {
  return (perms.modules[module]?.level ?? 0) >= level;
}

export function fieldOn(perms: Perms, field: string): boolean {
  return perms.fields[field] === "on";
}
