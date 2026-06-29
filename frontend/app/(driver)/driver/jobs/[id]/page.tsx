import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABEL, JOB_STATUS_VARIANT } from "@/lib/labels";
import { formatDate, formatYen } from "@/lib/utils";
import { DailyReportForm } from "./daily-report-form";

export default async function DriverJobDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const driverId = session?.user?.driverId;
  if (!driverId) redirect("/login");
  const { id } = await params;

  const job = await prisma.deliveryJob.findUnique({
    where: { id },
    include: {
      client: { select: { companyName: true } },
      dispatch: { select: { driverId: true } },
      dailyReport: true,
    },
  });
  // Authorization: only the assigned driver can view.
  if (!job || job.dispatch?.driverId !== driverId) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{job.jobCode}</h1>
        <Badge variant={JOB_STATUS_VARIANT[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle>Job Details</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p><span className="text-muted-foreground">Client: </span>{job.client.companyName}</p>
          <p><span className="text-muted-foreground">Pickup: </span>{job.pickupAddress}</p>
          <p><span className="text-muted-foreground">Delivery: </span>{job.deliveryAddress}</p>
          <p><span className="text-muted-foreground">Date: </span>{formatDate(job.deliveryDate)}</p>
          <p><span className="text-muted-foreground">Cargo: </span>{job.cargoDescription}</p>
          <p><span className="text-muted-foreground">Reward: </span>{formatYen(job.rewardAmount)}</p>
          {job.note && <p><span className="text-muted-foreground">Note: </span>{job.note}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Daily Report</CardTitle></CardHeader>
        <CardContent>
          {job.dailyReport ? (
            <div className="space-y-1 text-sm">
              <p>Work: {formatDate(job.dailyReport.workStart, true)} – {formatDate(job.dailyReport.workEnd, true)}</p>
              <p>Distance: {job.dailyReport.mileage} km</p>
              {job.dailyReport.note && <p>Note: {job.dailyReport.note}</p>}
              {job.dailyReport.proofImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={job.dailyReport.proofImageUrl} alt="Proof" className="mt-2 max-h-64 rounded-md border" />
              )}
              <p className="text-emerald-500">Submitted</p>
            </div>
          ) : (
            <DailyReportForm jobId={job.id} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
