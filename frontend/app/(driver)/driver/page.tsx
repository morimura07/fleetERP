import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { serverApi } from "@frontend/lib/server-api";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";
import { Badge } from "@frontend/components/ui/badge";
import { JOB_STATUS_LABEL, JOB_STATUS_VARIANT } from "@frontend/lib/labels";
import type { JobStatus } from "@frontend/lib/enums";
import { formatDate, formatYen } from "@frontend/lib/utils";

export const dynamic = "force-dynamic";

type DriverDispatch = {
  id: string;
  scheduledStart: string;
  job: {
    id: string;
    jobCode: string;
    status: JobStatus;
    deliveryAddress: string;
    rewardAmount: number;
    client: { companyName: string };
  };
};

export default async function DriverHome() {
  const session = await auth();
  const driverId = session?.user?.driverId;
  if (!driverId) redirect("/login");

  const dispatches = await serverApi<DriverDispatch[]>("/api/driver/dispatches");

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);
  const startOf = (d: DriverDispatch) => new Date(d.scheduledStart);

  const today = dispatches.filter((d) => startOf(d) >= todayStart && startOf(d) < todayEnd && d.job.status !== "COMPLETED");
  const upcoming = dispatches.filter((d) => startOf(d) >= todayEnd && d.job.status !== "COMPLETED");
  const completed = dispatches.filter((d) => d.job.status === "COMPLETED");

  const Section = ({ title, list }: { title: string; list: DriverDispatch[] }) => (
    <Card>
      <CardHeader><CardTitle>{title} ({list.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 && <p className="text-sm text-muted-foreground">No jobs</p>}
        {list.map((d) => (
          <Link key={d.id} href={`/driver/jobs/${d.job.id}`} className="block rounded-md border p-3 hover:bg-accent">
            <div className="flex items-center justify-between">
              <span className="font-medium">{d.job.jobCode}</span>
              <Badge variant={JOB_STATUS_VARIANT[d.job.status]}>{JOB_STATUS_LABEL[d.job.status]}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">{d.job.client.companyName} / {d.job.deliveryAddress}</div>
            <div className="text-xs text-muted-foreground">{formatDate(d.scheduledStart, true)} · {formatYen(d.job.rewardAmount)}</div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">My Jobs</h1>
      <Section title="Today" list={today} />
      <Section title="Upcoming" list={upcoming} />
      <Section title="Completed" list={completed} />
    </div>
  );
}
