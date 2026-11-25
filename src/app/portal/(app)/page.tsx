import { CatalogView } from "@/components/portal/CatalogView";
export const metadata = { title: "Shop" };
export default function ShopPage() {
  return <CatalogView mode="portal" cartHref="/portal/cart" />;
}
