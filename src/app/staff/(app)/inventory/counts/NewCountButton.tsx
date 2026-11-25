"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAction } from "@/components/ui/useAction";
import { createCount } from "../actions";

export function NewCountButton() {
  const t = useTranslations("inventory");
  const router = useRouter();
  const { run, pending } = useAction();
  return (
    <button className="btn-primary" disabled={pending} onClick={() => run(() => createCount(null), {
      success: t("countStarted"), onDone: (id) => router.push(`/staff/inventory/counts/${id}`),
    })}>+ {t("newCount")}</button>
  );
}
