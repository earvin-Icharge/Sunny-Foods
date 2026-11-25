"use client";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { setArchived, setPaused } from "./actions";

export function PauseButton({ id, paused }: { id: string; paused: boolean }) {
  const t = useTranslations("vouchers");
  const { run, pending } = useAction();
  return <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setPaused(id, !paused), { undo: true })}>{paused ? `▶ ${t("resume")}` : `⏸ ${t("pause")}`}</button>;
}

export function ArchiveVoucherButton({ id, archived }: { id: string; archived: boolean }) {
  const t = useTranslations("vouchers");
  const { run, pending } = useAction();
  return <button className="btn-secondary btn-sm" disabled={pending} onClick={() => { if (archived || confirm(t("archiveConfirm"))) run(() => setArchived(id, !archived), { undo: true }); }}>{archived ? t("unarchive") : t("archive")}</button>;
}
