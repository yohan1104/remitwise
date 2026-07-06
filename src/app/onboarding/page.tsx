import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const metadata = { title: "Set up · RemitWise" };
export const dynamic = "force-dynamic";

/** Resume route for accounts that created a login but didn't finish setup. */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/register");
  if (user.onboarded) redirect("/dashboard");
  return <OnboardingWizard mode="resume" initialRate={user.savingsRate} />;
}
