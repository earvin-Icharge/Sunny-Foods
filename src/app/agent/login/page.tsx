import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";
export const metadata = { title: "Agent login" };
export default async function Page() {
  const t = await getTranslations("auth");
  return <LoginForm area="agent" title={t("agentLogin")} />;
}
