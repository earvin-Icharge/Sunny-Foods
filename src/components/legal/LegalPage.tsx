import Image from "next/image";
import { getTranslations } from "next-intl/server";

// Privacy policy & terms (Data Privacy Act RA 10173). Text in messages/<lang>/legal.json — have a lawyer review before go-live.
export async function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const t = await getTranslations("legal");
  const sections = t.raw(`${kind}.sections`) as { h: string; p: string }[];
  return (
    <main className="mx-auto max-w-2xl p-6">
      <Image src="/logo.png" alt="Sunny Foods" width={1200} height={615} className="h-auto w-40" />
      <h1 className="mt-4 text-3xl font-bold">{t(`${kind}.title`)}</h1>
      <p className="text-sm text-brown/60">{t("updated")}</p>
      {sections.map((s) => (
        <section key={s.h} className="mt-5">
          <h2 className="text-lg font-bold">{s.h}</h2>
          <p className="mt-1 whitespace-pre-line text-brown/80">{s.p}</p>
        </section>
      ))}
    </main>
  );
}
