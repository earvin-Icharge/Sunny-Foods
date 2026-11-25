import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";
export const metadata = { title: "Customer login" };
export default async function Page() {
  const t = await getTranslations("auth");
  const tp = await getTranslations("portal");
  return <LoginForm area="portal" title={t("customerLogin")} footer={
    <div className="card grid gap-2 text-center">
      <p>{t("noAccount")}</p>
      <Link href="/portal/signup" className="btn-secondary">{t("signUp")}</Link>
      <Link href="/portal/browse" className="text-sm font-semibold text-sunny">{tp("browseProducts")}</Link>
    </div>
  } />;
}
