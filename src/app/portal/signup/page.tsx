import { PortalLoginForm } from "@/components/portal/PortalLoginForm";

export const metadata = { title: "Sign up" };
// Same choices as login (Google, Facebook, phone, email); ?ref= is the agent's invite code.
export default async function Page({ searchParams }: PageProps<"/portal/signup">) {
  const sp = await searchParams;
  return <PortalLoginForm signup refCode={typeof sp.ref === "string" ? sp.ref.slice(0, 40) : undefined} />;
}
