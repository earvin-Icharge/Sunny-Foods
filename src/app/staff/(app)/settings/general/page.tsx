import { getLocale, getTranslations } from "next-intl/server";
import { requirePerm } from "@/lib/auth";
import { readAs } from "@/lib/actions";
import { can } from "@/lib/perms";
import { date } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { GeneralForm, BlockedDates } from "./GeneralForm";

export const metadata = { title: "General settings" };

export default async function GeneralSettings() {
  const user = await requirePerm("internal", "settings");
  const t = await getTranslations("settings");
  const locale = await getLocale();
  const d = await readAs(user, async (tx) => ({
    settings: await tx`select key, value from app.app_settings where deleted_at is null`,
    blocked: await tx`select id, date, reason from app.blocked_delivery_dates where deleted_at is null and date >= (now() at time zone 'Asia/Manila')::date - 30 order by date`,
  }));
  const s: Record<string, unknown> = Object.fromEntries(d.settings.map((r) => [String(r.key), r.value]));
  return (
    <>
      <PageHeader title={t("general")} back="/staff/settings" />
      <GeneralForm s={s} canEdit={can(user.perms, "settings", 3)} />
      <BlockedDates canEdit={can(user.perms, "settings", 3)} rows={d.blocked.map((b) => ({ id: String(b.id), label: date(b.date as string, locale), reason: (b.reason as string) ?? "" }))} />
    </>
  );
}
