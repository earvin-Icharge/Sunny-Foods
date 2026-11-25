"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

/** Photo field that opens the phone camera (or file picker). Value is sent with the form. */
export function PhotoInput({ name, required, label, currentUrl, accept = "image/*" }: { name: string; required?: boolean; label?: string; currentUrl?: string | null; accept?: string }) {
  const t = useTranslations("common");
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  return (
    <div>
      {label && <span className="label">{label}</span>}
      <label className="flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-brown/20 bg-cream-light p-3 text-center">
        {preview && accept.startsWith("image") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="max-h-40 rounded-lg object-contain" />
        ) : (
          <span className="font-semibold text-brown/70">📷 {t("takePhoto")}</span>
        )}
        <input type="file" name={name} accept={accept} capture="environment" required={required} className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }} />
      </label>
    </div>
  );
}
