"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { postJson } from "@/lib/portal-client";
import { useToast } from "@/components/ui/Toast";

/** Data Privacy Act requests for agents: a copy of my data, or deletion (Spec 7.10, 8.13). */
export function PrivacyRequests() {
  const t = useTranslations("portal");
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(kind: "copy" | "deletion") {
    setBusy(true);
    const r = await postJson("/api/portal/privacy", { kind, confirm });
    setBusy(false);
    if (!r.ok) return toast.show(r.error, "error");
    toast.show(kind === "copy" ? t("requestSent") : t("deletionRequested"));
    setConfirm("");
    router.refresh();
  }
  return (
    <section className="card grid gap-3">
      <h2 className="text-lg font-bold">{t("privacyTitle")}</h2>
      <p className="text-sm text-brown/70">{t("privacyHelp")}</p>
      <div><button className="btn-secondary" disabled={busy} onClick={() => send("copy")}>{t("requestCopy")}</button></div>
      <div className="rounded-xl border border-st-problem/30 p-3">
        <h3 className="font-bold text-st-problem">{t("deleteAccount")}</h3>
        <p className="text-sm text-brown/70">{t("deleteAccountHelp")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="input max-w-48" placeholder="DELETE" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button className="btn-danger" disabled={busy || confirm.trim().toUpperCase() !== "DELETE"} onClick={() => send("deletion")}>{t("deleteAccount")}</button>
        </div>
      </div>
    </section>
  );
}
