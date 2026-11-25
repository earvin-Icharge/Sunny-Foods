"use client";
import { useTranslations } from "next-intl";
/** Print / Save as PDF (the browser's print dialog offers "Save as PDF" on phones and computers). */
export function PrintButton() {
  const t = useTranslations("common");
  return <button className="btn-primary" onClick={() => window.print()}>🖨️ {t("print")} / PDF</button>;
}
