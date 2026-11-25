import Image from "next/image";
import { CatalogView } from "@/components/portal/CatalogView";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
export const metadata = { title: "Products" };
// Public product list without login: photos and stock badges, no prices (Spec 13).
export default function BrowsePage() {
  return (
    <main className="mx-auto max-w-6xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <Image src="/logo.png" alt="Sunny Foods" width={140} height={70} priority />
        <LanguageSwitcher />
      </div>
      <CatalogView mode="public" cartHref="/portal/login" loginHref="/portal/login" />
    </main>
  );
}
