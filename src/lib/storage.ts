import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase/admin";
import { env } from "./env";

// Buckets: "product-photos" (public: product pictures only) and "private" (proofs, permits, backups...).
export const PUBLIC_BUCKET = "product-photos";
export const PRIVATE_BUCKET = "private";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/json"];
const MAX_BYTES = 10 * 1024 * 1024;

export async function uploadFile(file: File | Blob, folder: string, opts: { public?: boolean; name?: string } = {}): Promise<string> {
  const type = (file as File).type || "application/octet-stream";
  if (!ALLOWED.includes(type)) throw new Error("This file type is not allowed. Use a photo (JPG/PNG) or PDF.");
  if (file.size > MAX_BYTES) throw new Error("File is too big (max 10 MB).");
  const ext = ((file as File).name?.split(".").pop() || type.split("/")[1] || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${folder}/${opts.name ?? randomUUID()}.${ext}`;
  const bucket = opts.public ? PUBLIC_BUCKET : PRIVATE_BUCKET;
  const { error } = await supabaseAdmin().storage.from(bucket).upload(path, file, { contentType: type, upsert: true });
  if (error) throw new Error("Upload failed: " + error.message);
  return opts.public ? `public:${path}` : path;
}

export async function uploadBuffer(buf: Buffer, path: string, contentType: string): Promise<string> {
  const { error } = await supabaseAdmin().storage.from(PRIVATE_BUCKET).upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error("Upload failed: " + error.message);
  return path;
}

/** URL to show a stored file. Public product photos: CDN URL. Private files: signed link valid 1 hour. */
export async function fileUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("public:")) return publicUrl(path);
  const { data } = await supabaseAdmin().storage.from(PRIVATE_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export function publicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const p = path.replace(/^public:/, "");
  return `${env.supabaseUrl}/storage/v1/object/public/${PUBLIC_BUCKET}/${p}`;
}
