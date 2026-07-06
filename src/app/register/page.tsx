import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const metadata = { title: "Create account · RemitWise" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.onboarded ? "/dashboard" : "/onboarding");
  return <OnboardingWizard mode="register" />;
}
