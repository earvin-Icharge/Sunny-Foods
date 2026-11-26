import Image from "next/image";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

/** Login / sign-up pages: language menu on the right, big centred logo below it. */
export function AuthHeader() {
  return (
    <div className="grid gap-2">
      <div className="flex justify-end"><LanguageSwitcher /></div>
      <Image src="/logo.png" alt="Sunny Foods" width={1200} height={614} priority className="mx-auto h-auto w-80 sm:w-96" />
    </div>
  );
}
