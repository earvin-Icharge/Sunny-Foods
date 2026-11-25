"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { decideDataRequest } from "../actions";

export function DecideButtons({ id, kind, name }: { id: string; kind: string; name: string }) {
  const t = useTranslations("settings");
  const { run, pending } = useAction();
  const [confirm, setConfirm] = useState("");
  const needType = kind === "deletion";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {needType && <input className="input w-48" placeholder={name} value={confirm} onChange={(e) => setConfirm(e.target.value)} title={t("typeNameToDelete")} />}
      <button className={needType ? "btn-danger btn-sm" : "btn-primary btn-sm"} disabled={pending || (needType && confirm.trim() !== name)}
        onClick={() => run(() => decideDataRequest(id, true))}>{needType ? t("approveDeletion") : t("approveCopy")}</button>
      <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => decideDataRequest(id, false))}>{t("reject")}</button>
    </div>
  );
}
