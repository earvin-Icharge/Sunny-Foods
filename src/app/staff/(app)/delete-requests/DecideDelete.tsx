"use client";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { decideDeleteRequest } from "../trash/actions";

export function DecideDelete({ id }: { id: string }) {
  const t = useTranslations("trash");
  const { run, pending } = useAction();
  return (
    <div className="flex gap-2">
      <button className="btn-danger btn-sm" disabled={pending} onClick={() => run(() => decideDeleteRequest(id, true))}>{t("approve")}</button>
      <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => decideDeleteRequest(id, false))}>{t("reject")}</button>
    </div>
  );
}
