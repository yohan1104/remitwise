import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { PiggyBank, Target, Sparkles } from "lucide-react";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden brand-gradient p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-20 top-1/3 size-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-10 size-72 rounded-full bg-black/10 blur-3xl" />
        <Link href="/" className="relative">
          <Logo textClassName="text-white" size={36} />
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Turn every remittance into lasting financial security.
          </h2>
          <ul className="mt-8 space-y-4 text-white/90">
            {[
              { icon: PiggyBank, t: "Auto-save 20% of every payment" },
              { icon: Target, t: "Goals that fund themselves" },
              { icon: Sparkles, t: "AI guidance on your real numbers" },
            ].map((f) => (
              <li key={f.t} className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-white/15">
                  <f.icon className="size-4.5" />
                </span>
                <span>{f.t}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">
          Send More. Save Smarter. Live Better.
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-col">
        <div className="flex items-center justify-between p-5">
          <Link href="/" className="lg:hidden">
            <Logo size={30} />
          </Link>
          <span className="hidden lg:block" />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
