"use client";
import { supabaseBrowser } from "./supabase/client";

/**
 * Browser/store-app helper for the portal JSON API (Spec 9a).
 * - Web: same-site cookies, relative URLs.
 * - Store app (Capacitor): screens are bundled, so calls go to NEXT_PUBLIC_API_BASE
 *   (https://order.sunnyfoods.com.ph) with "Authorization: Bearer <access token>".
 * Last catalog and My Orders are kept on the device so they still open offline.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!isNativeApp() && !API_BASE) return {};
  const { data } = await supabaseBrowser().auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export type ApiResult<T> = { ok: true; data: T; offline?: boolean } | { ok: false; error: string; status?: number; data?: T };

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...(await authHeaders()), ...((init.headers as Record<string, string>) ?? {}) };
  if (init.body && typeof init.body === "string") headers["Content-Type"] = "application/json";
  try {
    const r = await fetch(API_BASE + path, { ...init, headers, cache: "no-store", credentials: API_BASE ? "omit" : "same-origin" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error ?? (j.errors ? "invalid" : "Something went wrong."), status: r.status, data: j };
    // write routes answer { ok, data }; read routes answer the data itself
    if (j && typeof j === "object" && "ok" in j && "data" in j && Object.keys(j).length <= 2) return { ok: true, data: j.data as T };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, error: "offline", status: 0 };
  }
}

export function postJson<T = unknown>(path: string, body: unknown, method = "POST") {
  return api<T>(path, { method, body: JSON.stringify(body) });
}

/** GET with an offline copy (catalog, My Orders). */
export async function cachedGet<T>(path: string, cacheKey: string): Promise<ApiResult<T>> {
  const r = await api<T>(path);
  try {
    if (r.ok) localStorage.setItem("sf:" + cacheKey, JSON.stringify(r.data));
    else if (r.status === 0) {
      const hit = localStorage.getItem("sf:" + cacheKey);
      if (hit) return { ok: true, data: JSON.parse(hit) as T, offline: true };
    }
  } catch {}
  return r;
}
