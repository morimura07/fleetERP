import { Hono } from "hono";
import { prisma } from "@backend/lib/prisma";
import { dailyReportSchema, paginationSchema } from "@backend/lib/validations";
import { logActivity } from "@backend/lib/activity";
import { notify } from "@backend/lib/notifications";
import { can } from "@backend/lib/rbac";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const reports = new Hono();

reports.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  if (!can(user.role, "report:read")) throw new AuthError("You do not have permission", 403);
  const { page, pageSize } = paginationSchema.parse(c.req.query());

  // Drivers see only their own reports.
  const where = user.role === "DRIVER" ? { driverId: user.driverId ?? "__none__" } : {};

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
  return ok(c, items, pageMeta(page, pageSize, total));
});

reports.post("/", requireAuth, requirePermission("report:write"), async (c) => {
  const user = c.get("user");
  if (!user.driverId) throw new AuthError("Not a driver account", 403);

  const body = dailyReportSchema.parse(await c.req.json());

  // The job must be dispatched to THIS driver — prevents reporting on others' jobs.
  const d = await prisma.dispatch.findUnique({ where: { jobId: body.jobId } });
  if (!d || d.driverId !== user.driverId) {
    throw new AuthError("You are not allowed to submit a report for this job", 403);
  }

  const report = await prisma.$transaction(async (tx) => {
    const r = await tx.dailyReport.create({ data: { ...body, driverId: user.driverId! } });
    await tx.deliveryJob.update({ where: { id: body.jobId }, data: { status: "COMPLETED" } });
    await tx.dispatch.update({ where: { id: d.id }, data: { status: "DONE" } });
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
  return created(c, report);
});
