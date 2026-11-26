import Image from "next/image";
import { CatalogView } from "@/components/portal/CatalogView";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { SampleNotice } from "@/components/shell/SampleNotice";
export const metadata = { title: "Products" };
// Public product list without login: photos and stock badges, no prices (Spec 13).
export default function BrowsePage() {
  return (
    <>
    <SampleNotice />
    <main className="mx-auto max-w-6xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <Image src="/logo.png" alt="Sunny Foods" width={1200} height={615} priority className="h-auto w-40" />
        <LanguageSwitcher />
      </div>
      <CatalogView mode="public" cartHref="/portal/login" loginHref="/portal/login" />
    </main>
    </>
  );
}
