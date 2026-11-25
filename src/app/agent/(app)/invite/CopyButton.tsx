"use client";
import { useState } from "react";
export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn-primary" onClick={async () => {
      try {
        if (navigator.share) await navigator.share({ url: text });
        else { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }
      } catch {}
    }}>{ok ? done : label}</button>
  );
}
