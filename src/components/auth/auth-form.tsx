"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, registerSchema } from "@/lib/validation";
import type { Resolver } from "react-hook-form";

type Mode = "login" | "register";
type FormValues = { name?: string; email: string; password: string };

/**
 * Only same-origin paths are honoured as a post-login destination — never a
 * caller-supplied absolute URL, which would make this an open redirect.
 */
function safeNext(next?: string): string {
  if (!next) return "/dashboard";
  return /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : "/dashboard";
}

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [submitting, setSubmitting] = React.useState(false);
  const destination = safeNext(next);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(
      isRegister ? registerSchema : loginSchema,
    ) as Resolver<FormValues>,
    defaultValues: { name: "", email: "", password: "" },
  });

  async function submit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      toast.success(isRegister ? "Welcome to RemitWise!" : "Welcome back!");
      router.push(destination);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  function fillDemo() {
    setValue("email", "demo@remitwise.app");
    setValue("password", "demo1234");
    if (isRegister) setValue("name", "Demo User");
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {isRegister ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isRegister
            ? "Start saving from your very next remittance."
            : "Sign in to your RemitWise dashboard."}
        </p>
      </div>

      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        {isRegister && (
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" placeholder="Maria Santos" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete={isRegister ? "new-password" : "current-password"}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {isRegister ? "Create account" : "Sign in"}
        </Button>
      </form>

      <button
        type="button"
        onClick={fillDemo}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <Sparkles className="size-3.5" /> Prefill demo credentials
      </button>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isRegister ? "Already have an account?" : "New to RemitWise?"}{" "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-medium text-primary hover:underline"
        >
          {isRegister ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
