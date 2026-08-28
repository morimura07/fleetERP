"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { dailyReportSchema, type DailyReportInput } from "@frontend/lib/validations";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Textarea } from "@frontend/components/ui/textarea";
import { useToast } from "@frontend/components/ui/toast";

export function DailyReportForm({ jobId }: { jobId: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [proofUrl, setProofUrl] = useState<string>("");

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<DailyReportInput>({ resolver: zodResolver(dailyReportSchema), defaultValues: { jobId } });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiFetch<{ url: string }>("/api/uploads", { method: "POST", body: fd });
      setProofUrl(data.url);
      toast({ title: "Image uploaded", variant: "success" });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof ApiError ? e.message : "", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(data: DailyReportInput) {
    try {
      await apiFetch("/api/reports", { method: "POST", body: JSON.stringify({ ...data, jobId, proofImageUrl: proofUrl || undefined }) });
      toast({ title: "Report submitted", variant: "success" });
      router.refresh();
    } catch (e) {
      toast({ title: "Submit error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <input type="hidden" {...register("jobId")} value={jobId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Work Start</Label><Input type="datetime-local" {...register("workStart")} />
          {errors.workStart && <p className="text-xs text-destructive">{errors.workStart.message}</p>}</div>
        <div className="space-y-1.5"><Label>Work End</Label><Input type="datetime-local" {...register("workEnd")} />
          {errors.workEnd && <p className="text-xs text-destructive">{errors.workEnd.message}</p>}</div>
      </div>
      <div className="space-y-1.5"><Label>Distance (km)</Label><Input type="number" {...register("mileage")} />
        {errors.mileage && <p className="text-xs text-destructive">{errors.mileage.message}</p>}</div>
      <div className="space-y-1.5"><Label>Note</Label><Textarea {...register("note")} /></div>
      <div className="space-y-1.5">
        <Label>Proof of Delivery (image)</Label>
        <Input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
        {proofUrl && /* eslint-disable-line @next/next/no-img-element */ <img src={proofUrl} alt="Proof" className="mt-2 max-h-48 rounded-md border" />}
      </div>
      <Button type="submit" disabled={isSubmitting || uploading}>Submit Report (complete job)</Button>
    </form>
  );
}
