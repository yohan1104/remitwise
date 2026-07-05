import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { Landing } from "@/components/marketing/landing";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return <Landing />;
}
