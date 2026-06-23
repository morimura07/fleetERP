import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { handleError, error } from "@/lib/api";
import { dispatchSheetPdf } from "@/lib/services/pdf";
import { formatDate } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

/** Dispatch sheet PDF for a given date. GET ?date=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission("export:run");
    const dateStr = req.nextUrl.searchParams.get("date");
    if (!dateStr) return error("date is required", 422);
    const start = new Date(dateStr + "T00:00:00");
    const end = new Date(dateStr + "T23:59:59");

    const dispatches = await prisma.dispatch.findMany({
      where: { scheduledStart: { gte: start, lte: end }, status: { not: "CANCELLED" } },
      include: {
        job: { include: { client: { select: { companyName: true } } } },
        driver: { select: { name: true } },
        vehicle: { select: { vehicleNumber: true } },
      },
      orderBy: { scheduledStart: "asc" },
    });

    const pdf = await dispatchSheetPdf(
      dateStr,
      dispatches.map((d) => ({
        jobCode: d.job.jobCode,
        client: d.job.client.companyName,
        pickup: d.job.pickupAddress,
        delivery: d.job.deliveryAddress,
        driver: d.driver.name,
        vehicle: d.vehicle.vehicleNumber,
        time: `${formatDate(d.scheduledStart, true).slice(-5)}-${formatDate(d.scheduledEnd, true).slice(-5)}`,
      })),
    );

    await logActivity({ userId: user.id, action: "EXPORT", target: `Dispatch:pdf:${dateStr}` });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="dispatch-${dateStr}.pdf"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
