"use client";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Download } from "lucide-react";
import { formatDate } from "@frontend/lib/utils";

interface Report {
  id: string; mileage: number; workStart: string; workEnd: string; note: string | null;
  driver: { name: string }; job: { jobCode: string; deliveryAddress: string };
}

export default function ReportsPage() {
  const columns: Column<Report>[] = [
    { key: "driver", header: "Driver", render: (r) => r.driver.name },
    { key: "job", header: "Job", render: (r) => r.job.jobCode },
    { key: "delivery", header: "Delivery To", render: (r) => r.job.deliveryAddress },
    { key: "workStart", header: "Start", render: (r) => formatDate(r.workStart, true) },
    { key: "workEnd", header: "End", render: (r) => formatDate(r.workEnd, true) },
    { key: "mileage", header: "Distance (km)" },
    {
      key: "pdf", header: "", render: (r) => (
        <Button variant="ghost" size="icon" asChild><a href={`/api/exports/report-pdf/${r.id}`}><Download className="h-4 w-4" /></a></Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Daily Reports</h1>
      <DataTable<Report> endpoint="/api/reports" columns={columns} searchPlaceholder="" />
    </div>
  );
}
