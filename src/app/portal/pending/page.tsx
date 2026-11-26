import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
export const metadata = { title: "Account pending" };
// Shown after sign-up: email confirmation + approval by Sunny Foods.
export default async function Page() {
  const t = await getTranslations("portal.signup");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
      <Image src="/logo-header.png" alt="Sunny Foods" width={329} height={118} className="mx-auto h-auto w-64 sm:w-72" />
      <div className="card"><h1 className="text-2xl font-bold">{t("doneTitle")}</h1><p className="mt-2">{t("doneText")}</p>
        <Link href="/portal/login" className="btn-primary mt-4 w-full">{t("goLogin")}</Link></div>
    </main>
  );
}
