"use client";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { DownloadButton } from "@frontend/components/data/download-button";
import { formatDate } from "@frontend/lib/utils";

interface Report {
  id: string; mileage: number; workStart: string; workEnd: string; note: string | null;
  driver: { name: string }; job: { jobCode: string; deliveryAddress: string };
}

const columns: Column<Report>[] = [
  { key: "driver", header: "Driver", render: (r) => r.driver.name },
  { key: "job", header: "Job", render: (r) => r.job.jobCode },
  { key: "delivery", header: "Delivery To", render: (r) => r.job.deliveryAddress },
  { key: "workStart", header: "Start", render: (r) => formatDate(r.workStart, true) },
  { key: "workEnd", header: "End", render: (r) => formatDate(r.workEnd, true) },
  { key: "mileage", header: "Distance (km)" },
  {
    key: "pdf", header: "", render: (r) => (
      <DownloadButton variant="ghost" size="icon" path={`/api/exports/report-pdf/${r.id}`} fileName={`daily-report-${r.id}.pdf`} aria-label="Download PDF" />
    ),
  },
];

/** Drivers' end-of-day sheets. Unchanged; moved out of the page so the library could take the top slot. */
export function DailyReports() {
  return <DataTable<Report> endpoint="/api/reports" columns={columns} searchPlaceholder="" />;
}
