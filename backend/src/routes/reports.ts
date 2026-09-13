import { Hono } from "hono";
import { prisma } from "@backend/lib/prisma";
import { dailyReportSchema, paginationSchema } from "@backend/lib/validations";
import { logActivity } from "@backend/lib/activity";
import { notify } from "@backend/lib/notifications";
import { can } from "@backend/lib/rbac";
import { areaScope, areaForWrite } from "@backend/lib/scope";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, requirePermission, effectiveRoleKey } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";
import { exportIfRequested } from "@backend/lib/export-http";
import {
  allReports, findReport, assertRequiredParams, dayBound, REPORT_GROUPS,
} from "@backend/services/report-registry";
// Importing the definitions is what registers them.
import "@backend/services/reports/finance";

export const reports = new Hono();

reports.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  if (!can(user.role, "report:read")) throw new AuthError("You do not have permission", 403);
  const { page, pageSize } = paginationSchema.parse(c.req.query());

  // Drivers see only their own reports; everyone else is scoped to their entity.
  const where =
    user.role === "DRIVER"
      ? { driverId: user.driverId ?? "__none__" }
      : areaScope(user);

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
    const r = await tx.dailyReport.create({ data: { ...body, driverId: user.driverId!, dataAreaId: areaForWrite(user) } });
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

// ── Report library (client requirements, Sept 2026) ──────────────────────────
//
// Mounted under /library so it cannot collide with the daily-report CRUD above,
// which owns "/" and is a different thing entirely despite the shared name.

/** Everything this user may run, grouped, with the parameters each needs. */
reports.get("/library", requireAuth, (c) => {
  const user = c.get("user");
  const available = allReports().filter((r) => can(effectiveRoleKey(user), r.permission));
  return ok(c, {
    groups: REPORT_GROUPS,
    reports: available.map((r) => ({
      key: r.key,
      title: r.title,
      group: r.group,
      description: r.description,
      params: r.params,
      unavailable: r.unavailable ?? null,
    })),
  });
});

/**
 * Run one report. `?format=csv|xlsx|pdf` downloads it instead.
 *
 * The export uses the report's own columns, so a downloaded file and the table
 * on screen cannot drift apart, and a new report is exportable the moment it is
 * registered.
 */
reports.get("/library/:key", requireAuth, async (c) => {
  const user = c.get("user");
  const definition = findReport(c.req.param("key"));

  if (!can(effectiveRoleKey(user), definition.permission)) {
    throw new AuthError("You do not have permission", 403);
  }
  if (definition.unavailable) {
    throw new AuthError(definition.unavailable, 422);
  }

  const params = c.req.query();
  assertRequiredParams(definition, params);

  const ctx = {
    user,
    dataAreaId: areaForWrite(user, undefined),
    params,
    from: dayBound(params.from),
    to: dayBound(params.to, true),
  };
  const rows = await definition.run(ctx);

  const file = await exportIfRequested(c, { title: definition.title, columns: definition.columns }, async () => rows);
  if (file) return file;

  return ok(c, {
    key: definition.key,
    title: definition.title,
    description: definition.description,
    columns: definition.columns.map((col) => col.header),
    rows: rows.map((row) =>
      Object.fromEntries(definition.columns.map((col) => [col.header, col.value(row) ?? null])),
    ),
    summary: definition.summary?.(rows) ?? [],
    rowCount: rows.length,
  });
});
