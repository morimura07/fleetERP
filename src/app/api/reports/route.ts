import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requirePermission, AuthError } from "@/lib/auth-guard";
import { ok, created, handleError, error, pageMeta } from "@/lib/api";
import { dailyReportSchema, paginationSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notifications";
import { can } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!can(user.role, "report:read")) throw new AuthError("You do not have permission", 403);
    const sp = req.nextUrl.searchParams;
    const { page, pageSize } = paginationSchema.parse(Object.fromEntries(sp));

    // Drivers see only their own reports.
    const where =
      user.role === "DRIVER" ? { driverId: user.driverId ?? "__none__" } : {};

    const [items, total] = await Promise.all([
      prisma.dailyReport.findMany({
        where,
        include: {
          driver: { select: { name: true } },
          job: { select: { jobCode: true, deliveryAddress: true } },
        },
        orderBy: { workStart: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.dailyReport.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("report:write");
    if (!user.driverId) return error("Not a driver account", 403);

    const body = dailyReportSchema.parse(await req.json());

    // The job must be dispatched to THIS driver — prevents reporting on others' jobs.
    const dispatch = await prisma.dispatch.findUnique({ where: { jobId: body.jobId } });
    if (!dispatch || dispatch.driverId !== user.driverId) {
      return error("You are not allowed to submit a report for this job", 403);
    }

    const report = await prisma.$transaction(async (tx) => {
      const r = await tx.dailyReport.create({
        data: { ...body, driverId: user.driverId! },
      });
      await tx.deliveryJob.update({ where: { id: body.jobId }, data: { status: "COMPLETED" } });
      await tx.dispatch.update({ where: { id: dispatch.id }, data: { status: "DONE" } });
      return r;
    });

    // Notify dispatchers/admins of completion.
    const reviewers = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "DISPATCHER"] }, isActive: true },
      select: { id: true },
    });
    await Promise.all(
      reviewers.map((u) =>
        notify({
          userId: u.id,
          type: "COMPLETION",
          title: "Daily report submitted",
          body: `${user.name ?? "A driver"} submitted a daily report.`,
          link: `/reports`,
        }),
      ),
    );

    await logActivity({ userId: user.id, action: "CREATE", target: `DailyReport:${report.id}` });
    return created(report);
  } catch (e) {
    return handleError(e);
  }
}
