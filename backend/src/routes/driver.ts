import { Hono } from "hono";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { requireAuth } from "@backend/lib/auth";
import { ok } from "@backend/lib/http";

/**
 * Driver portal data — strictly scoped to the authenticated driver's own jobs.
 * (The web driver portal previously read these directly from Prisma.)
 */
export const driver = new Hono();

/** All of the driver's own dispatches (with job + client) for the portal home. */
driver.get("/dispatches", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user.driverId) throw new AuthError("Not a driver account", 403);

  const dispatches = await prisma.dispatch.findMany({
    where: { driverId: user.driverId, status: { not: "CANCELLED" } },
    include: { job: { include: { client: { select: { companyName: true } } } } },
    orderBy: { scheduledStart: "asc" },
  });
  return ok(c, dispatches);
});

/** A single job — only if dispatched to this driver. */
driver.get("/jobs/:id", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user.driverId) throw new AuthError("Not a driver account", 403);
  const id = c.req.param("id");

  const job = await prisma.deliveryJob.findUnique({
    where: { id },
    include: {
      client: { select: { companyName: true } },
      dispatch: { select: { driverId: true } },
      dailyReport: true,
    },
  });
  if (!job || job.dispatch?.driverId !== user.driverId) {
    throw new AuthError("Not found", 404);
  }
  return ok(c, job);
});
