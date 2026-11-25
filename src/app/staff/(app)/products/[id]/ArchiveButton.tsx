"use client";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { setArchived } from "../actions";

export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const t = useTranslations("products");
  const { run, pending } = useAction();
  return (
    <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setArchived(id, !archived), { undo: true })}>
      {archived ? t("unarchive") : t("archive")}
    </button>
  );
}
