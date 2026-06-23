import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { handleError } from "@/lib/api";
import { dailyReportPdf } from "@/lib/services/pdf";
import { formatDate } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

/** Daily report PDF for a single daily report. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("report:read");
    const { id } = await params;
    const r = await prisma.dailyReport.findUniqueOrThrow({
      where: { id },
      include: {
        driver: { select: { name: true } },
        job: { include: { client: { select: { companyName: true } } } },
      },
    });

    const pdf = await dailyReportPdf({
      driver: r.driver.name,
      jobCode: r.job.jobCode,
      client: r.job.client.companyName,
      deliveryAddress: r.job.deliveryAddress,
      workStart: formatDate(r.workStart, true),
      workEnd: formatDate(r.workEnd, true),
      mileage: r.mileage,
      note: r.note ?? "",
    });

    await logActivity({ userId: user.id, action: "EXPORT", target: `DailyReport:pdf:${id}` });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report-${id}.pdf"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
