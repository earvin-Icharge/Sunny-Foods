"use client";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { decideMovement } from "./actions";

export function DecideButtons({ id }: { id: string }) {
  const t = useTranslations("inventory");
  const { run, pending } = useAction();
  return (
    <div className="flex gap-2">
      <button className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => decideMovement(id, true), { success: t("approved") })}>{t("approve")}</button>
      <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => decideMovement(id, false), { success: t("rejected") })}>{t("reject")}</button>
    </div>
  );
}
