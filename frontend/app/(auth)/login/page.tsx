"use client";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginSchema } from "@frontend/lib/validations";
import { clearToken } from "@frontend/lib/auth-token";
import { z } from "zod";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@frontend/components/ui/card";

type FormData = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  // Arrived here because the backend token expired: fully clear the stale
  // NextAuth session + client token so we don't loop back into a 401'ing page.
  useEffect(() => {
    if (params.get("reason") === "expired") {
      clearToken();
      signOut({ redirect: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: FormData) {
    setError(null);
    const res = await signIn("credentials", { ...data, redirect: false });
    if (res?.error) {
      setError("Incorrect email or password");
      return;
    }
    router.push(params.get("callbackUrl") ?? "/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center glow-panel p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">FleetFlow</CardTitle>
          <CardDescription>Sign in to the logistics ERP</CardDescription>
        </CardHeader>
        <CardContent>
          {params.get("reason") === "expired" && (
            <p className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              Your session expired — please sign in again.
            </p>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
            <div className="text-center text-sm">
              <Link href="/forgot-password" className="text-muted-foreground hover:underline">
                Forgot your password?
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
