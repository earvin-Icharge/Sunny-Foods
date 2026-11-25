// Static export of the customer portal screens for the store app (Spec 9a).
// The screens are the SAME client components as the web portal (../src/components/portal),
// imported through the "@/..." alias. All data comes from https://order.<domain>/api/portal/*
// with a Bearer token (see ../src/lib/portal-client.ts).
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const root = path.resolve(import.meta.dirname, "..");
const withNextIntl = createNextIntlPlugin("./i18n.ts");

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_API_BASE: `https://order.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "sunnyfoods.com.ph"}`,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
  turbopack: { root, resolveAlias: { "@/*": "../src/*" } },
  transpilePackages: [],
};

export default withNextIntl(config);
