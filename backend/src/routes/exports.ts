import { Hono } from "hono";
import { prisma } from "@backend/lib/prisma";
import { toCsv } from "@backend/services/csv";
import { dispatchSheetPdf, monthlyPaymentPdf, dailyReportPdf } from "@backend/services/pdf";
import { computeMonthlyPayments } from "@backend/services/payment";
import { formatDate } from "@backend/lib/format";
import { logActivity } from "@backend/lib/activity";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { areaScope } from "@backend/lib/scope";

export const exports = new Hono();

/** Dispatch sheet PDF for a given date. GET /exports/dispatch-pdf?date=YYYY-MM-DD */
exports.get("/dispatch-pdf", requireAuth, requirePermission("export:run"), async (c) => {
  const user = c.get("user");
  const dateStr = c.req.query("date");
  if (!dateStr) throw new AuthError("date is required", 422);
  const start = new Date(dateStr + "T00:00:00");
  const end = new Date(dateStr + "T23:59:59");

  const dispatches = await prisma.dispatch.findMany({
    where: { ...areaScope(user), scheduledStart: { gte: start, lte: end }, status: { not: "CANCELLED" } },
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
  return c.body(new Uint8Array(pdf), 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="dispatch-${dateStr}.pdf"`,
  });
});

/** Jobs CSV export. GET /exports/jobs-csv?status= */
exports.get("/jobs-csv", requireAuth, requirePermission("export:run"), async (c) => {
  const user = c.get("user");
  const status = c.req.query("status");

  const jobs = await prisma.deliveryJob.findMany({
    where: { ...areaScope(user), ...(status ? { status: status as never } : {}) },
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
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="jobs-${Date.now()}.csv"`,
  });
});

/** Monthly payments PDF. GET /exports/payment-pdf?year=&month= */
exports.get("/payment-pdf", requireAuth, requirePermission("export:run"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const now = new Date();
  const year = Number(sp.year ?? now.getFullYear());
  const month = Number(sp.month ?? now.getMonth() + 1);

  const rows = await computeMonthlyPayments(year, month);
  const pdf = await monthlyPaymentPdf(year, month, rows);

  await logActivity({ userId: user.id, action: "EXPORT", target: `Payment:pdf:${year}-${month}` });
  return c.body(new Uint8Array(pdf), 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="payments-${year}-${month}.pdf"`,
  });
});

/** Daily report PDF for a single daily report. GET /exports/report-pdf/:id */
exports.get("/report-pdf/:id", requireAuth, requirePermission("report:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  // findFirst + scope, not findUniqueOrThrow: a report belonging to another
  // tenant must read as missing rather than be rendered into a PDF.
  const r = await prisma.dailyReport.findFirst({
    where: { id, ...areaScope(user) },
    include: {
      driver: { select: { name: true } },
      job: { include: { client: { select: { companyName: true } } } },
    },
  });
  if (!r) throw new AuthError("Not found", 404);

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
  return c.body(new Uint8Array(pdf), 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="report-${id}.pdf"`,
  });
});
