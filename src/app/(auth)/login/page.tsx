import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Sign in · RemitWise" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
