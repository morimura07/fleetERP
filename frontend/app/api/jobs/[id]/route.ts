import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError } from "@/lib/api";
import { jobSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { notifyDriver } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePermission("job:read");
    const { id } = await params;
    const job = await prisma.deliveryJob.findUniqueOrThrow({
      where: { id },
      include: {
        client: true,
        dispatch: { include: { driver: true, vehicle: true } },
        dailyReport: true,
      },
    });
    return ok(job);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("job:write");
    const { id } = await params;
    const body = jobSchema.partial().parse(await req.json());

    const before = await prisma.deliveryJob.findUniqueOrThrow({
      where: { id },
      include: { dispatch: { select: { driverId: true } } },
    });
    const job = await prisma.deliveryJob.update({ where: { id }, data: body });

    // Notify the assigned driver on status changes.
    if (body.status && body.status !== before.status && before.dispatch?.driverId) {
      await notifyDriver(before.dispatch.driverId, {
        type: body.status === "COMPLETED" ? "COMPLETION" : "JOB_UPDATE",
        title: "Job updated",
        body: `Job ${job.jobCode} status changed to ${body.status}.`,
        link: `/driver/jobs/${job.id}`,
      });
    }

    await logActivity({ userId: user.id, action: "UPDATE", target: `DeliveryJob:${id}`, detail: body });
    return ok(job);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("job:write");
    const { id } = await params;
    await prisma.deliveryJob.delete({ where: { id } });
    await logActivity({ userId: user.id, action: "DELETE", target: `DeliveryJob:${id}` });
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
