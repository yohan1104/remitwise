import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Sign in · RemitWise" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Set when a QR deep link bounced an unauthenticated visitor here, so the
  // payment they scanned survives the sign-in.
  const { next } = await searchParams;
  return <AuthForm mode="login" next={next} />;
}
