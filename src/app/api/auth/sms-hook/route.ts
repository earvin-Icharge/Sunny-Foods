import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Supabase "Send SMS" hook (decision D1, 2026-11-26): Supabase makes the 6-digit login
 * code, this sends it by text through Semaphore (Philippine SMS service).
 * Env: SMS_HOOK_SECRET (from Supabase, "v1,whsec_…"), SEMAPHORE_API_KEY, SEMAPHORE_SENDER (optional).
 * Requests are signed by Supabase (Standard Webhooks); unsigned ones are refused.
 */
const MAX_AGE_S = 5 * 60;

function fail(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status });
}

function signatureOk(body: string, id: string, ts: string, sigHeader: string, secret: string) {
  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return sigHeader.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.SMS_HOOK_SECRET;
  const apiKey = process.env.SEMAPHORE_API_KEY;
  if (!secret || !apiKey) return fail(500, "SMS sending is not set up yet.");
  const body = await req.text();
  const id = req.headers.get("webhook-id") ?? "";
  const ts = req.headers.get("webhook-timestamp") ?? "";
  const sig = req.headers.get("webhook-signature") ?? "";
  if (!id || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > MAX_AGE_S || !signatureOk(body, id, ts, sig, secret)) {
    return fail(401, "Bad signature.");
  }
  let phone = "", otp = "";
  try {
    const p = JSON.parse(body) as { user?: { phone?: string }; sms?: { otp?: string } };
    phone = String(p.user?.phone ?? "").replace(/\D/g, "");
    otp = String(p.sms?.otp ?? "");
  } catch { return fail(400, "Bad request."); }
  if (!phone || !/^\d{4,10}$/.test(otp)) return fail(400, "Missing phone or code.");

  const form = new URLSearchParams({
    apikey: apiKey,
    number: phone,
    message: `Your Sunny Foods code is ${otp}. It expires in 5 minutes. Do not share this code with anyone.`,
  });
  if (process.env.SEMAPHORE_SENDER) form.set("sendername", process.env.SEMAPHORE_SENDER);
  try {
    const r = await fetch("https://api.semaphore.co/api/v4/messages", { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      console.error("semaphore send failed", r.status, (await r.text()).slice(0, 300));
      return fail(502, "Could not send the text message.");
    }
  } catch (e) {
    console.error("semaphore send error", e);
    return fail(502, "Could not send the text message.");
  }
  return NextResponse.json({});
}
