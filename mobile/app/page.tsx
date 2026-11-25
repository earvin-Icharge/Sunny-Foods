"use client";
// Same catalog screen as order.sunnyfoods.com.ph, bundled in the app.
// Remaining screens (cart, orders, account, login, offline) follow the same pattern: see README "Screens".
import { CatalogView } from "@/components/portal/CatalogView";
export default function Home() {
  return <main className="p-4"><CatalogView mode="portal" cartHref="/cart/" /></main>;
}
