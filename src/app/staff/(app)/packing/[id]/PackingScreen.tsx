"use client";
import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/Toast";
import { PhotoInput } from "@/components/ui/PhotoInput";
import { qty as fmt } from "@/lib/format";
import { markPacked, startPacking, toggleCheck } from "../actions";

export type PackCheck = { id: string; type: "pick" | "material"; required: number; checked: boolean; label: string; sub: string; photo: string | null };
export type PackItem = { id: string; name: string; sku: string; qty: number; unit: string; isFree: boolean; storage: string; photo: string | null;
  instruction: string | null; packingPhoto: string | null; checks: PackCheck[] };

export function PackingScreen({ orderId, status, items, canPack }: { orderId: string; status: string; items: PackItem[]; canPack: boolean }) {
  const t = useTranslations("packing");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(items.flatMap((i) => i.checks.map((c) => [c.id, c.checked]))));
  const [packed, setPacked] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, String(i.qty)])));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const total = items.reduce((n, i) => n + i.checks.length, 0);
  const done = Object.values(checked).filter(Boolean).length;
  const allDone = total > 0 && done === total;
  const changed = items.filter((i) => Number(packed[i.id]) !== i.qty);

  if (status === "confirmed") {
    return (
      <div className="card text-center">
        <p className="mb-4 text-lg">{t("readyToStart")}</p>
        {canPack && <button className="btn-primary w-full max-w-sm text-lg" disabled={pending} onClick={() => start(async () => {
          const r = await startPacking(orderId);
          if (!r.ok) toast.show(r.error, "error"); else router.refresh();
        })}>📦 {t("start")}</button>}
      </div>
    );
  }
  if (status !== "packing") return <div className="card text-center text-lg">{t("alreadyPacked")}</div>;

  function toggle(id: string) {
    if (!canPack) return;
    const next = !checked[id];
    setChecked((x) => ({ ...x, [id]: next }));
    start(async () => {
      const r = await toggleCheck(id, next);
      if (!r.ok) { setChecked((x) => ({ ...x, [id]: !next })); toast.show(r.error, "error"); }
    });
  }

  function submit(confirmQty: boolean) {
    const fd = new FormData(formRef.current ?? undefined);
    const map: Record<string, number> = {};
    for (const i of items) if (Number(packed[i.id]) !== i.qty) map[i.id] = Number(packed[i.id]);
    fd.set("packed", JSON.stringify(map));
    fd.set("confirm_qty_change", confirmQty ? "1" : "0");
    start(async () => {
      const r = await markPacked(orderId, fd);
      if (!r.ok) { toast.show(r.error, "error"); return; }
      toast.show(t("packedDone"));
      router.push("/staff/packing");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 pb-28">
      <div className="sticky top-20 z-20 -mx-4 bg-cream-light/95 px-4 py-2 backdrop-blur md:mx-0">
        <div className="flex items-center justify-between text-sm font-semibold"><span>{t("progress", { done, total })}</span><span>{Math.round((done / Math.max(total, 1)) * 100)}%</span></div>
        <div className="mt-1 h-3 overflow-hidden rounded-full bg-brown/10"><div className="h-full bg-st-ok transition-all" style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} /></div>
      </div>
      {items.map((i) => (
        <section key={i.id} className="card grid gap-3">
          <div className="flex gap-4">
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-cream sm:h-36 sm:w-36">
              {i.photo ? <Image src={i.photo} alt="" fill sizes="144px" className="object-cover" /> : <span className="flex h-full items-center justify-center text-5xl">🥩</span>}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold leading-tight sm:text-2xl">{i.name}</h2>
              <div className="text-sm text-brown/60">{i.sku}{i.storage ? ` · ${t(`storage.${i.storage}`)}` : ""}</div>
              <div className="mt-2 text-3xl font-black text-sunny">× {fmt(i.qty)} <span className="text-lg font-semibold">{i.unit}</span></div>
              {i.isFree && <span className="rounded bg-st-ok/15 px-2 text-xs font-bold text-st-ok">{t("freeItem")}</span>}
            </div>
          </div>
          {(i.instruction || i.packingPhoto) && (
            <div className="flex gap-3 rounded-xl bg-gold/15 p-3">
              {i.packingPhoto && <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg"><Image src={i.packingPhoto} alt="" fill sizes="80px" className="object-cover" /></div>}
              {i.instruction && <p className="text-sm"><b>{t("howToPack")}:</b> {i.instruction}</p>}
            </div>
          )}
          <ul className="grid gap-2">
            {i.checks.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => toggle(c.id)} disabled={!canPack}
                  className={`flex min-h-16 w-full items-center gap-3 rounded-xl border-2 px-3 text-left ${checked[c.id] ? "border-st-ok bg-st-ok/10" : "border-brown/15 bg-white"}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 text-xl font-black ${checked[c.id] ? "border-st-ok bg-st-ok text-white" : "border-brown/30"}`}>{checked[c.id] ? "✓" : ""}</span>
                  {c.photo && <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded"><Image src={c.photo} alt="" fill sizes="40px" className="object-cover" /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{c.type === "pick" ? `${t("take")} ${fmt(c.required)} ${i.unit} — ${t("batch")} ${c.label}` : `${fmt(c.required)} × ${c.label}`}</span>
                    {c.sub && <span className="block text-sm text-brown/60">{c.type === "pick" ? `📍 ${c.sub}` : c.sub}</span>}
                  </span>
                </button>
              </li>
            ))}
            {i.checks.length === 0 && <li className="text-sm text-brown/60">{t("noChecks")}</li>}
          </ul>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-semibold">{t("packedQty")}</span>
            <input className="input min-h-10 w-28" type="number" min="0" step="1" value={packed[i.id]} onChange={(e) => setPacked((x) => ({ ...x, [i.id]: e.target.value }))} />
            {Number(packed[i.id]) !== i.qty && <span className="font-semibold text-st-problem">⚠ {t("differentQty")}</span>}
          </label>
        </section>
      ))}
      <form ref={formRef} className="card" onSubmit={(e) => e.preventDefault()}>
        <PhotoInput name="photo" label={t("photoOptional")} />
      </form>
      {canPack && (
        <div className="fixed inset-x-0 bottom-16 z-30 bg-white/95 p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:bottom-0 md:left-60">
          <button className="btn-primary w-full text-lg" disabled={!allDone || pending}
            onClick={() => (changed.length ? setConfirmOpen(true) : submit(false))}>
            {allDone ? `✓ ${t("markPacked")}` : t("tickAll", { left: total - done })}
          </button>
        </div>
      )}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setConfirmOpen(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{t("qtyChangedTitle")}</h3>
            <p className="mt-1 text-sm text-brown/70">{t("qtyChangedHelp")}</p>
            <ul className="mt-2 text-sm">{changed.map((i) => <li key={i.id}>• {i.name}: {fmt(i.qty)} → <b>{packed[i.id]}</b></li>)}</ul>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirmOpen(false)}>{tc("back")}</button>
              <button className="btn-primary" disabled={pending} onClick={() => { setConfirmOpen(false); submit(true); }}>{t("confirmQty")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
