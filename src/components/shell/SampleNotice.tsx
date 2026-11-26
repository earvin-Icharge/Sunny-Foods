import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { asSystem } from "@/lib/db";

/** Is sample (test) data loaded? Set by supabase/sample/sample_data.sql, removed before go-live. */
export const sampleDataOn = cache(async (): Promise<boolean> => {
  try {
    const [r] = await asSystem((tx) => tx`select app.setting('sample_data') is not null as on`);
    return Boolean(r?.on);
  } catch {
    return false;
  }
});

/** Strip on every screen while sample data is loaded, so nobody mistakes it for real data. */
export async function SampleNotice() {
  if (!(await sampleDataOn())) return null;
  const t = await getTranslations("common");
  return (
    <div role="note" className="no-print bg-gold px-4 py-1.5 text-center text-xs font-bold text-charcoal sm:text-sm">
      🧪 {t("sampleNotice")}
    </div>
  );
}
