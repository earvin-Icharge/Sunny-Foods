import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Staff login" };
export default async function Page({ searchParams }: PageProps<"/staff/login">) {
  const sp = await searchParams;
  const t = await getTranslations("auth");
  return <LoginForm area="internal" error={typeof sp.error === "string" ? sp.error.slice(0, 40) : undefined} title={t("staffLogin")} footer={
    <div className="card grid gap-2 text-center">
      <p>{t("noAccount")}</p>
      <Link href="/staff/signup" className="btn-secondary">{t("signUp")}</Link>
    </div>
  } />;
}
