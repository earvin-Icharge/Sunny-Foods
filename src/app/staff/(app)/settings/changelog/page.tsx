import fs from "node:fs";
import path from "node:path";
import { getTranslations } from "next-intl/server";
import { requireArea } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "What's new" };

/** Renders /CHANGELOG.md: "## " = version heading, "### " = sub-heading, "- " = bullet. */
function render(md: string) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => { if (list.length) { out.push(<ul key={`l${k}`} className="mb-3 ml-5 list-disc">{list.map((x, i) => <li key={i}>{x}</li>)}</ul>); list = []; } };
  md.split("\n").forEach((line, i) => {
    const l = line.trimEnd();
    if (l.startsWith("- ") || l.startsWith("* ")) { list.push(l.slice(2).replace(/\*\*/g, "")); return; }
    flush(i);
    if (l.startsWith("## ")) out.push(<h2 key={i} className="mt-5 text-xl font-bold">{l.slice(3)}</h2>);
    else if (l.startsWith("### ")) out.push(<h3 key={i} className="mt-3 font-bold">{l.slice(4)}</h3>);
    else if (l.startsWith("# ")) return;
    else if (l.trim()) out.push(<p key={i} className="mb-2">{l.replace(/\*\*/g, "")}</p>);
  });
  flush(-1);
  return out;
}

export default async function Changelog() {
  await requireArea("internal");
  const t = await getTranslations("settings");
  let md = "";
  try { md = fs.readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8"); } catch {}
  const version = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
  return (
    <>
      <PageHeader title={t("whatsNew")} subtitle={`${t("version")}: ${version.slice(0, 7)}`} back="/staff/settings" />
      <div className="card">{md ? render(md) : <p className="text-brown/60">{t("noChangelog")}</p>}</div>
    </>
  );
}
