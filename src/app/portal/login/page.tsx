import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";
import { PortalLoginForm } from "@/components/portal/PortalLoginForm";

export const metadata = { title: "Customer login" };
export default async function Page({ searchParams }: PageProps<"/portal/login">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error.slice(0, 40) : undefined;
  if (sp.password !== "1") return <PortalLoginForm error={error} />;
  // Email + password: for accounts made by Sunny Foods staff and older sign-ups.
  const t = await getTranslations("auth");
  return <LoginForm area="portal" title={t("customerLogin")} footer={
    <div className="card grid gap-2 text-center">
      <Link href="/portal/login" className="btn-secondary">{t("otherWays")}</Link>
    </div>
  } />;
}
