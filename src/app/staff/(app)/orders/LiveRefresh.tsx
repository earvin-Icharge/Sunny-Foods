"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Refreshes the list when a new order arrives (live), with a 10-second fallback check. */
export function LiveRefresh({ userId, kinds = ["new_order", "order_cancelled_by_customer", "change_request"] }: { userId: string; kinds?: string[] }) {
  const router = useRouter();
  const key = kinds.join(",");
  useEffect(() => {
    const watch = key.split(",");
    const channel = supabaseBrowser()
      .channel(`orders-live-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "app", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload: { new: Record<string, unknown> }) => { if (watch.includes(String(payload.new.kind))) router.refresh(); })
      .subscribe();
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 10000);
    return () => { clearInterval(timer); supabaseBrowser().removeChannel(channel); };
  }, [userId, router, key]);
  return null;
}
