"use client";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function Cleaner() {
  const sp = useSearchParams();
  useEffect(() => {
    if (!sp.has("li")) return;
    const u = new URL(location.href);
    u.searchParams.delete("li");
    history.replaceState(history.state, "", u.pathname + u.search + u.hash);
  }, [sp]);
  return null;
}

/** Removes the one-time "?li=1" (login check, see passwordLogin + proxy.ts) from the address bar. */
export function CleanUrl() {
  return <Suspense fallback={null}><Cleaner /></Suspense>;
}
