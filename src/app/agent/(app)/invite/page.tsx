import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { env } from "@/lib/env";
import { requireAgent } from "../agent-context";
import { CopyButton } from "./CopyButton";

export const metadata = { title: "Invite" };

// Referral code + link + QR for new customers (Spec 7.14). New sign-ups link to the agent after boss approval.
export default async function Invite() {
  const ctx = await requireAgent({ refer: true });
  const t = await getTranslations("agentPortal");
  const link = `https://order.${env.rootDomain}/signup?ref=${encodeURIComponent(ctx.agent.referral_code)}`;
  const qr = await QRCode.toDataURL(link, { width: 320, margin: 1, color: { dark: "#3B2F2F", light: "#FFFFFF" } });
  return (
    <>
      <PageHeader title={t("invite")} subtitle={t("inviteHelp")} />
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="card flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={t("qrAlt")} width={260} height={260} />
        </div>
        <div className="card grid content-start gap-3">
          <div><span className="label">{t("referralCode")}</span><div className="font-mono text-3xl font-bold">{ctx.agent.referral_code}</div></div>
          <div><span className="label">{t("referralLink")}</span><div className="break-all rounded-lg bg-cream-light p-3 font-mono text-sm">{link}</div></div>
          <CopyButton text={link} label={t("copyLink")} done={t("copied")} />
        </div>
      </div>
    </>
  );
}
