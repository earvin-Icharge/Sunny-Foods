import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/actions/common";
import type { Area } from "@/lib/areas";
import { AREAS } from "@/lib/areas";
import Link from "next/link";

export async function NotAllowed({ area }: { area: Area }) {
  const t = await getTranslations("common");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl">🔒</div>
      <h1 className="text-2xl font-bold">{t("notAllowedTitle")}</h1>
      <p className="text-brown/70">{t("notAllowedText")}</p>
      <Link className="btn-secondary" href={AREAS[area].prefix}>{t("home")}</Link>
      <form action={signOut.bind(null, area)}><button className="btn-primary">{t("signOut")}</button></form>
    </main>
  );
}
