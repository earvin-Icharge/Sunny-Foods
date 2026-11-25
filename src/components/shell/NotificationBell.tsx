"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { supabaseBrowser } from "@/lib/supabase/client";
import { markNotificationsRead } from "@/app/actions/common";
import { dateTime } from "@/lib/format";

type N = { id: string; kind: string; title: string; body: string | null; link: string | null; data: Record<string, unknown>; read_at: string | null; created_at: string };

/** In-app bell (Spec 7.9). Live updates within seconds; sound for new portal orders. */
export function NotificationBell({ userId, prefix, dark }: { userId: string; prefix: string; dark?: boolean }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/notifications", { cache: "no-store" });
    if (r.ok) { const j = await r.json(); setItems(j.items); setUnread(j.unread); }
  }, []);

  const beep = useCallback(() => {
    try {
      audio.current ??= new AudioContext();
      const ctx = audio.current; const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.25, ctx.currentTime);
      o.start(); o.stop(ctx.currentTime + 0.4);
      setTimeout(() => { const o2 = ctx.createOscillator(); o2.frequency.value = 1175; o2.connect(g); o2.start(); o2.stop(ctx.currentTime + 0.4); }, 450);
    } catch {}
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, 30000);
    const channel = supabaseBrowser()
      .channel(`notif-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "app", table: "notifications", filter: `user_id=eq.${userId}` }, (payload: { new: Record<string, unknown> }) => {
        const n = payload.new as unknown as N;
        setItems((x) => [n, ...x].slice(0, 30));
        setUnread((u) => u + 1);
        if (n.data?.sound) beep();
      })
      .subscribe();
    return () => { clearTimeout(first); clearInterval(poll); supabaseBrowser().removeChannel(channel); };
  }, [userId, load, beep]);

  return (
    <div className="relative">
      <button aria-label={t("notifications")} onClick={() => setOpen((o) => !o)}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full text-xl ${dark ? "text-white hover:bg-white/10" : "hover:bg-cream"}`}>
        🔔
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-sunny px-1.5 text-center text-xs font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl bg-white text-brown shadow-xl ring-1 ring-brown/10">
          <div className="flex items-center justify-between border-b border-brown/10 px-4 py-3">
            <b>{t("notifications")}</b>
            <button className="text-sm font-semibold text-sunny" onClick={async () => { await markNotificationsRead(); setUnread(0); load(); }}>{t("markAllRead")}</button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <p className="p-4 text-sm text-brown/60">{t("noNotifications")}</p>}
            {items.map((n) => (
              <Link key={n.id} href={n.link ? prefix + n.link : "#"} onClick={() => { setOpen(false); markNotificationsRead([n.id]); }}
                className={`block border-b border-brown/5 px-4 py-3 hover:bg-cream-light ${n.read_at ? "opacity-60" : ""}`}>
                <div className="font-semibold">{n.title}</div>
                {n.body && <div className="text-sm text-brown/70">{n.body}</div>}
                <div className="text-xs text-brown/50">{dateTime(n.created_at, locale)}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
