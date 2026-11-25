"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { savePushSubscription } from "@/app/actions/common";
import { env } from "@/lib/env";

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Small button to turn on phone/desktop alerts (optional push, Spec 7.9). */
export function PushOptIn() {
  const t = useTranslations("common");
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!env.vapidPublicKey || !("Notification" in window) || !("serviceWorker" in navigator)) return;
    const id = setTimeout(() => setShow(Notification.permission === "default"), 0);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <button className="btn-secondary btn-sm" onClick={async () => {
      const perm = await Notification.requestPermission();
      setShow(false);
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(env.vapidPublicKey) });
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await savePushSubscription(j);
    }}>🔔 {t("enableAlerts")}</button>
  );
}
