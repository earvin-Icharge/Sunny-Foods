import { getTranslations } from "next-intl/server";
import { AccountView } from "@/components/portal/AccountView";
import { PageHeader } from "@/components/ui/PageHeader";
export const metadata = { title: "My Account" };
export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getTranslations("nav");
  const sp = await searchParams;
  return <><PageHeader title={t("account")} /><AccountView payOrderId={typeof sp.pay === "string" ? sp.pay : undefined} /></>;
}
