"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearMustChangePassword } from "@/app/actions/account";

export function ResetPasswordForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <form className="card grid gap-3" onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 8) return setErr(t("passwordTooShort"));
        if (pw !== pw2) return setErr(t("passwordsDontMatch"));
        setBusy(true);
        const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
        if (error) { setBusy(false); return setErr(error.message); }
        await clearMustChangePassword();
        router.replace(next); router.refresh();
      }}>
        <h1 className="text-2xl font-bold">{t("newPassword")}</h1>
        <input className="input" type="password" autoComplete="new-password" placeholder={t("newPassword")} value={pw} onChange={(e) => setPw(e.target.value)} />
        <input className="input" type="password" autoComplete="new-password" placeholder={t("repeatPassword")} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {err && <p className="text-sm text-st-problem">{err}</p>}
        <button className="btn-primary" disabled={busy}>{t("savePassword")}</button>
      </form>
    </main>
  );
}
