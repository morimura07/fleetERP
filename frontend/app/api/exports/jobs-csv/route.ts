import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { handleError } from "@/lib/api";
import { toCsv } from "@/lib/services/csv";
import { logActivity } from "@/lib/activity";

/** Jobs CSV export. */
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission("export:run");
    const status = req.nextUrl.searchParams.get("status");

    const jobs = await prisma.deliveryJob.findMany({
      where: status ? { status: status as never } : {},
      include: { client: { select: { companyName: true } } },
      orderBy: { deliveryDate: "desc" },
    });

    const csv = toCsv(
      jobs.map((j) => ({
        jobCode: j.jobCode,
        client: j.client.companyName,
        pickupAddress: j.pickupAddress,
        deliveryAddress: j.deliveryAddress,
        deliveryDate: j.deliveryDate.toISOString().slice(0, 10),
        cargo: j.cargoDescription,
        reward: j.rewardAmount,
        status: j.status,
      })),
      [
        { key: "jobCode", header: "Job Code" },
        { key: "client", header: "Client" },
        { key: "pickupAddress", header: "Pickup" },
        { key: "deliveryAddress", header: "Delivery" },
        { key: "deliveryDate", header: "Delivery Date" },
        { key: "cargo", header: "Cargo" },
        { key: "reward", header: "Reward" },
        { key: "status", header: "Status" },
      ],
    );

    await logActivity({ userId: user.id, action: "EXPORT", target: "DeliveryJob:csv" });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="jobs-${Date.now()}.csv"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
