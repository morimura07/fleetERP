import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { jobSchema, paginationSchema } from "@backend/lib/validations";
import { buildOrderBy } from "@backend/lib/format";
import { logActivity } from "@backend/lib/activity";
import { notifyDriver } from "@backend/lib/notifications";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";

export const jobs = new Hono();

jobs.get("/", requireAuth, requirePermission("job:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q, sort, order } = paginationSchema.parse(sp);
  const status = sp.status;
  const clientId = sp.clientId;

  const where: Prisma.DeliveryJobWhereInput = {
    ...areaScope(user),
    ...(q
      ? {
          OR: [
            { jobCode: { contains: q, mode: "insensitive" } },
            { deliveryAddress: { contains: q, mode: "insensitive" } },
            { cargoDescription: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status ? { status: status as never } : {}),
    ...(clientId ? { clientId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.deliveryJob.findMany({
      where,
      include: { client: { select: { companyName: true } }, dispatch: { select: { id: true } } },
      orderBy: buildOrderBy(sort, order, ["deliveryDate", "jobCode", "status", "rewardAmount", "createdAt"], "deliveryDate"),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.deliveryJob.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

jobs.post("/", requireAuth, requirePermission("job:write"), async (c) => {
  const user = c.get("user");
  const body = jobSchema.parse(await c.req.json());
  const job = await prisma.deliveryJob.create({ data: { ...body, dataAreaId: areaForWrite(user), createdById: user.id } });
  await logActivity({ userId: user.id, action: "CREATE", target: `DeliveryJob:${job.id}` });
  return created(c, job);
});

jobs.get("/:id", requireAuth, requirePermission("job:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const job = await prisma.deliveryJob.findUnique({
    where: { id },
    include: {
      client: true,
      dispatch: { include: { driver: true, vehicle: true } },
      dailyReport: true,
    },
  });
  assertSameArea(user, job);
  return ok(c, job);
});

jobs.patch("/:id", requireAuth, requirePermission("job:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = jobSchema.partial().parse(raw);

  const before = await prisma.deliveryJob.findUnique({
    where: { id },
    include: { dispatch: { select: { driverId: true } } },
  });
  assertSameArea(user, before);
  const prev = before!;
  const job = await updateWithVersion<{ id: string; jobCode: string }>(
    prisma.deliveryJob, id, version, user.id, body,
  );

  // Notify the assigned driver on status changes.
  if (body.status && body.status !== prev.status && prev.dispatch?.driverId) {
    await notifyDriver(prev.dispatch.driverId, {
      type: body.status === "COMPLETED" ? "COMPLETION" : "JOB_UPDATE",
      title: "Job updated",
      body: `Job ${job.jobCode} status changed to ${body.status}.`,
      link: `/driver/jobs/${job.id}`,
    });
  }

  await logActivity({ userId: user.id, action: "UPDATE", target: `DeliveryJob:${id}`, detail: body });
  return ok(c, job);
});

jobs.delete("/:id", requireAuth, requirePermission("job:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.deliveryJob.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  await prisma.deliveryJob.delete({ where: { id } });
  await logActivity({ userId: user.id, action: "DELETE", target: `DeliveryJob:${id}` });
  return ok(c, { id });
});
