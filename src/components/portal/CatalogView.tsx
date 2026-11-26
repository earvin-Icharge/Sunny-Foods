"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api, cachedGet, postJson } from "@/lib/portal-client";
import { peso } from "@/lib/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { OfflineNote, ProductPhoto, packLabel, useName, type CatalogItem } from "./shared";

/**
 * Product catalog (Spec 7.10): photo, name, pack size, the customer's own price,
 * stock badge only (never quantities). Search + category filter. Add to cart.
 * mode "public" = not logged in (no prices); "agent" = agent ordering for a customer.
 */
export function CatalogView({ mode, customerId, cartHref, loginHref }: {
  mode: "portal" | "agent" | "public"; customerId?: string; cartHref: string; loginHref?: string;
}) {
  const t = useTranslations("portal");
  const name = useName();
  const toast = useToast();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [open, setOpen] = useState<CatalogItem | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const qs = customerId ? `?customer_id=${customerId}` : "";

  const loadCart = useCallback(async () => {
    if (mode === "public") return;
    const r = await api<{ items: { product_id: string; qty: number }[] }>(`/api/portal/cart${qs}`);
    if (r.ok) setCart(Object.fromEntries(r.data.items.map((i) => [i.product_id, i.qty])));
  }, [mode, qs]);

  useEffect(() => {
    let live = true;
    (async () => {
      const path = mode === "public" ? "/api/portal/browse" : `/api/portal/catalog${qs}`;
      const r = await cachedGet<{ items: CatalogItem[]; customer_status: string | null }>(path, `catalog:${mode}:${customerId ?? ""}`);
      if (!live) return;
      if (r.ok) { setItems(r.data.items); setStatus(r.data.customer_status); setOffline(Boolean(r.offline)); }
      else { setItems([]); if (r.status === 0) setOffline(true); }
      await loadCart();
    })();
    return () => { live = false; };
  }, [mode, qs, customerId, loadCart]);

  const categories = useMemo(() => {
    const m = new Map<string, CatalogItem>();
    for (const i of items ?? []) if (i.category_id && !m.has(i.category_id)) m.set(i.category_id, i);
    return [...m.values()].sort((a, b) => (a.category_sort ?? 0) - (b.category_sort ?? 0));
  }, [items]);

  const shown = (items ?? []).filter((i) => (!cat || i.category_id === cat)
    && (!q || `${i.name} ${i.name_zh_hans ?? ""} ${i.name_zh_hant ?? ""} ${i.name_tl ?? ""} ${i.sku}`.toLowerCase().includes(q.toLowerCase())));
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const canBuy = mode !== "public" && status === "approved" && !offline;

  async function add(p: CatalogItem, n: number) {
    setBusy(true);
    const r = await postJson(`/api/portal/cart`, { customer_id: customerId, product_id: p.id, qty: n, mode: "add" });
    setBusy(false);
    if (!r.ok) return toast.show(r.error, "error");
    toast.show(t("addedToCart", { name: name(p) }));
    setOpen(null);
    loadCart();
  }

  return (
    <div>
      {offline && <OfflineNote />}
      {mode === "portal" && status === "pending" && <div className="mb-4 rounded-xl bg-gold/20 p-4 font-semibold">⏳ {t("pendingBanner")}</div>}
      {mode === "public" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream p-4">
          <span className="font-semibold">{t("publicBanner")}</span>
          {loginHref && <Link href={loginHref} className="btn-primary btn-sm">{t("loginToOrder")}</Link>}
        </div>
      )}
      <div className="sticky top-20 z-20 -mx-4 bg-cream-light/95 px-4 pb-3 pt-1 backdrop-blur md:static md:mx-0 md:px-0">
        <input className="input" type="search" placeholder={t("searchProducts")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setCat("")} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${!cat ? "bg-sunny text-white" : "bg-white ring-1 ring-brown/10"}`}>{t("allProducts")}</button>
          {categories.map((c) => (
            <button key={c.category_id} onClick={() => setCat(c.category_id!)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${cat === c.category_id ? "bg-sunny text-white" : "bg-white ring-1 ring-brown/10"}`}>
              {name(c, "category")}
            </button>
          ))}
        </div>
      </div>
      {items === null ? <p className="py-10 text-center text-brown/60">{t("loading")}</p> : shown.length === 0 ? (
        <p className="card py-10 text-center text-brown/60">{t("noProducts")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => (
            <button key={p.id} onClick={() => { setOpen(p); setQty(1); }} className="card flex flex-col overflow-hidden !p-0 text-left hover:ring-sunny/40">
              <div className="relative aspect-square w-full">
                <ProductPhoto url={p.photo_url} />
                {cart[p.id] ? <span className="absolute right-2 top-2 rounded-full bg-sunny px-2 py-0.5 text-xs font-bold text-white">{cart[p.id]}</span> : null}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <span className="font-bold leading-tight">{name(p)}</span>
                <span className="text-xs text-brown/60">{packLabel(p, t)}</span>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-1 pt-1">
                  <span className="font-bold text-sunny">{p.price !== null && p.price !== undefined ? peso(p.price) : ""}</span>
                  {p.stock_badge && <StatusBadge kind="stock" status={p.stock_badge} />}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {cartCount > 0 && (
        <Link href={cartHref} className="btn-primary fixed inset-x-4 bottom-20 z-30 shadow-lg md:static md:mt-6 md:w-auto">
          🛒 {t("viewCart", { count: cartCount })}
        </Link>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="aspect-video w-full overflow-hidden rounded-2xl"><ProductPhoto url={open.photo_url} /></div>
            <h2 className="mt-3 text-2xl font-bold">{name(open)}</h2>
            <p className="text-sm text-brown/60">{name(open, "category")} · {packLabel(open, t)} · {t(`storage_${open.storage}`)}</p>
            {name(open, "description") && <p className="mt-2 text-brown/80">{name(open, "description")}</p>}
            <div className="mt-3 flex items-center gap-3">
              {open.price !== null && open.price !== undefined && <span className="text-2xl font-bold text-sunny">{peso(open.price)}</span>}
              {open.regular_price && open.price !== null && open.price < open.regular_price && <s className="text-brown/50">{peso(open.regular_price)}</s>}
              {open.stock_badge && <StatusBadge kind="stock" status={open.stock_badge} />}
            </div>
            {canBuy && open.price !== null ? (
              <div className="mt-5 flex items-center gap-3">
                <QtyStepper value={qty} onChange={setQty} />
                <button className="btn-primary flex-1" disabled={busy || open.stock_badge === "out"} onClick={() => add(open, qty)}>
                  {open.stock_badge === "out" ? t("outOfStock") : t("addToCart")}
                </button>
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-cream p-3 text-sm">{mode === "public" ? t("loginToSeePrices") : status === "pending" ? t("pendingBanner") : offline ? t("offlineNote") : t("notOrderable")}</p>
            )}
            <button className="btn-ghost mt-2 w-full" onClick={() => setOpen(null)}>{t("close")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function QtyStepper({ value, onChange, min = 1 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <div className="flex items-center rounded-xl ring-1 ring-brown/20">
      <button type="button" className="h-12 w-12 text-2xl font-bold" onClick={() => onChange(Math.max(min, value - 1))} aria-label="−">−</button>
      <input className="h-12 w-14 border-x border-brown/10 text-center text-lg font-bold" inputMode="decimal" value={value}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) onChange(n); }} />
      <button type="button" className="h-12 w-12 text-2xl font-bold" onClick={() => onChange(value + 1)} aria-label="+">+</button>
    </div>
  );
}
