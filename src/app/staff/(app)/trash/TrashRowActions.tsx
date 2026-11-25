"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { purgeItem, restoreItem } from "./actions";

export function TrashRowActions({ table, id, label, isOwner }: { table: string; id: string; label: string; isOwner: boolean }) {
  const t = useTranslations("trash");
  const tc = useTranslations("common");
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <div className="flex gap-2">
      <button className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => restoreItem(table, id), { success: t("restored") })}>{t("restore")}</button>
      {isOwner && <button className="btn-ghost btn-sm text-st-problem" onClick={() => setOpen(true)}>{t("emptyForever")}</button>}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="card grid w-full max-w-md gap-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{t("emptyTitle")}</h3>
            <p className="text-sm text-brown/70">{t("emptyHelp", { name: label })}</p>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={label} autoFocus />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>{tc("cancel")}</button>
              <button className="btn-danger" disabled={pending || (typed.trim() !== label.trim() && typed.trim() !== "DELETE")}
                onClick={() => run(() => purgeItem(table, id, typed.trim()), { success: t("emptied"), onDone: () => setOpen(false) })}>{t("emptyForever")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
