import { SignupForm } from "@/components/portal/SignupForm";
export const metadata = { title: "Sign up" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <SignupForm refCode={typeof sp.ref === "string" ? sp.ref.slice(0, 40) : undefined} />;
}
