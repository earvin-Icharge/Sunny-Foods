import { TeamSignupForm } from "@/components/auth/TeamSignupForm";

export const metadata = { title: "Sign up" };
export default function Page() {
  return <TeamSignupForm area="agent" />;
}
