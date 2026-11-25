"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/** OTA updates (Spec 9): checks on open and every 30 minutes; banner in the user's language. */
export function UpdateBanner() {
  const t = useTranslations("common");
  const [state, setState] = useState<"none" | "available" | "critical">("none");

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    async function check() {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = await r.json();
        if (BUILD !== "dev" && j.version && j.version !== "dev" && !BUILD.startsWith(j.version) && !j.version.startsWith(BUILD)) {
          setState(j.critical ? "critical" : "available");
        }
      } catch {}
    }
    check();
    const timer = setInterval(check, 30 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  async function update() {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    reg?.waiting?.postMessage("SKIP_WAITING");
    location.reload();
  }

  if (state === "none") return null;
  if (state === "critical") {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6">
        <div className="card max-w-sm text-center">
          <p className="text-lg font-bold">{t("updateRequired")}</p>
          <button className="btn-primary mt-4 w-full" onClick={update}>{t("updateNow")}</button>
        </div>
      </div>
    );
  }
  return (
    <button onClick={update} className="no-print fixed inset-x-0 top-0 z-[60] bg-gold px-4 py-3 text-center font-bold text-charcoal">
      {t("updateAvailable")}
    </button>
  );
}
