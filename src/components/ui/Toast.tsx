"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { undoChange } from "@/app/actions/common";
import { useRouter } from "next/navigation";

type ToastItem = { id: number; message: string; tone: "ok" | "error"; undoAuditId?: number | null };
const Ctx = createContext<{ show: (message: string, tone?: "ok" | "error", undoAuditId?: number | null) => void }>({ show: () => {} });

export function useToast() {
  return useContext(Ctx);
}

/** Toasts. A toast with undoAuditId shows the 10-second Undo button (Spec 8.3). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const show = useCallback((message: string, tone: "ok" | "error" = "ok", undoAuditId?: number | null) => {
    const id = ++seq.current;
    setItems((x) => [...x, { id, message, tone, undoAuditId }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), undoAuditId ? 10000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((i) => <ToastView key={i.id} item={i} onClose={() => setItems((x) => x.filter((y) => y.id !== i.id))} />)}
      </div>
    </Ctx.Provider>
  );
}

function ToastView({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const t = useTranslations("common");
  const router = useRouter();
  const [left, setLeft] = useState(10);
  useEffect(() => {
    if (!item.undoAuditId) return;
    const timer = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(timer);
  }, [item.undoAuditId]);
  return (
    <div className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-white shadow-lg ${item.tone === "error" ? "bg-st-problem" : "bg-charcoal"}`}>
      <span className="flex-1">{item.message}</span>
      {item.undoAuditId ? (
        <button className="rounded-lg bg-white/15 px-3 py-2 font-bold" onClick={async () => {
          const r = await undoChange(item.undoAuditId!);
          onClose();
          if (r.ok) router.refresh();
        }}>{t("undo")} ({left})</button>
      ) : null}
    </div>
  );
}
