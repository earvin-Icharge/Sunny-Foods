"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "./Toast";
import type { ActionResult } from "@/lib/actions";

/** Call a Server Action, show a toast (with Undo when possible), refresh the page. */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("common");
  function run<T>(fn: () => Promise<ActionResult<T>>, opts: { success?: string; undo?: boolean; onDone?: (data: T) => void; refresh?: boolean } = {}) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        toast.show(r.error, "error");
        return;
      }
      toast.show(opts.success ?? t("saved"), "ok", opts.undo ? r.auditId : undefined);
      if (opts.refresh !== false) router.refresh();
      opts.onDone?.(r.data);
    });
  }
  return { run, pending, error };
}
