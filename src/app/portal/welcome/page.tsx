import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthClaims } from "@/lib/auth";
import { asSystem } from "@/lib/db";
import { WelcomeForm } from "@/components/portal/WelcomeForm";

export const metadata = { title: "Your business" };

// New customer, first login: ask for the business details once.
export default async function Page() {
  const c = await getAuthClaims();
  if (!c) redirect("/portal/login");
  const [p] = await asSystem((tx) => tx`select 1 from app.profiles where id = ${c.id}`);
  if (p) redirect("/portal");
  const ref = (await cookies()).get("sf_ref")?.value;
  return <WelcomeForm name={c.name ?? undefined} email={c.email ?? undefined}
    phone={c.phone ? "+" + c.phone.replace(/^\+/, "") : undefined} refCode={ref ? decodeURIComponent(ref).slice(0, 40) : undefined} />;
}
