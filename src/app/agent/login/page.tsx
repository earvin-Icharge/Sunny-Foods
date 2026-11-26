import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Agent login" };
export default async function Page({ searchParams }: PageProps<"/agent/login">) {
  const sp = await searchParams;
  const t = await getTranslations("auth");
  return <LoginForm area="agent" error={typeof sp.error === "string" ? sp.error.slice(0, 40) : undefined} title={t("agentLogin")} footer={
    <div className="card grid gap-2 text-center">
      <p>{t("noAccount")}</p>
      <Link href="/agent/signup" className="btn-secondary">{t("signUp")}</Link>
    </div>
  } />;
}
