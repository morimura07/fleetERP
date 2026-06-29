"use client";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPasswordSchema } from "@frontend/lib/validations";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import { z } from "zod";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";

type FormData = z.infer<typeof resetPasswordSchema>;

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { token } });

  async function onSubmit(data: FormData) {
    setError(null);
    try {
      await apiFetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify(data) });
      router.push("/login");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "An error occurred");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <input type="hidden" {...register("token")} value={token} />
      <div className="space-y-2">
        <Label htmlFor="password">New Password</Label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm Password</Label>
        <Input id="confirm" type="password" {...register("confirm")} />
        {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>Reset Password</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center"><CardTitle>Set a New Password</CardTitle></CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <ResetForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
