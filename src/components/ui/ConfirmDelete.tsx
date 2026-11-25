"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { requestDelete } from "@/app/actions/common";
import { useAction } from "./useAction";

/** Delete with type-to-confirm (Spec 8.2). Staff get a request; the boss deletes directly to Trash. */
export function ConfirmDelete({ table, id, name, label, onDone }: { table: string; id: string; name: string; label?: string; onDone?: () => void }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const { run, pending } = useAction();
  const ok = typed.trim() === name.trim() || typed.trim() === "DELETE";
  return (
    <>
      <button type="button" className="btn-secondary btn-sm text-st-problem" onClick={() => setOpen(true)}>{label ?? t("delete")}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{t("deleteTitle")}</h3>
            <p className="mt-2 text-sm text-brown/70">{t("deleteHelp", { name })}</p>
            <input className="input mt-3" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoFocus />
            <input className="input mt-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonOptional")} />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>{t("cancel")}</button>
              <button className="btn-danger" disabled={!ok || pending} onClick={() => run(() => requestDelete(table, id, reason), {
                success: t("deletedOrRequested"), undo: true, onDone: () => { setOpen(false); onDone?.(); },
              })}>{t("delete")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
