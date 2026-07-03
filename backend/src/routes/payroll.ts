import { Hono } from "hono";
import { Prisma, EmployeeStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { employeeSchema, payRunSchema, paginationSchema } from "@backend/lib/validations";
import { computePayRun, approvePayRun, postPayRun } from "@backend/services/payroll";
import { logActivity } from "@backend/lib/activity";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const payroll = new Hono();

// ── Employees ──
payroll.get("/employees", requireAuth, requirePermission("payroll:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.EmployeeWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status && status in EmployeeStatus ? { status: status as EmployeeStatus } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.employee.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.employee.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

payroll.post("/employees", requireAuth, requirePermission("payroll:write"), async (c) => {
  const user = c.get("user");
  const body = employeeSchema.parse(await c.req.json());
  const emp = await prisma.employee.create({
    data: {
      dataAreaId: areaForWrite(user, body.dataAreaId),
      code: body.code,
      name: body.name,
      nationalId: body.nationalId || null,
      tin: body.tin || null,
      country: body.country.toUpperCase(),
      grossSalary: body.grossSalary,
      currency: body.currency,
      status: body.status,
      bankAccount: body.bankAccount || null,
      hiredAt: body.hiredAt,
      createdById: user.id,
    },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `Employee:${emp.id}` });
  return created(c, emp);
});

payroll.patch("/employees/:id", requireAuth, requirePermission("payroll:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = employeeSchema.partial().parse(raw);
  const existing = await prisma.employee.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const emp = await updateWithVersion(prisma.employee, id, version, user.id, {
    name: body.name,
    nationalId: body.nationalId,
    tin: body.tin,
    country: body.country?.toUpperCase(),
    grossSalary: body.grossSalary,
    currency: body.currency,
    status: body.status,
    bankAccount: body.bankAccount,
  });
  await logActivity({ userId: user.id, action: "UPDATE", target: `Employee:${id}` });
  return ok(c, emp);
});

// ── Pay runs ──
payroll.get("/runs", requireAuth, requirePermission("payroll:read"), async (c) => {
  const user = c.get("user");
  const { page, pageSize } = paginationSchema.parse(c.req.query());
  const where: Prisma.PayRunWhereInput = { ...areaScope(user) };
  const [items, total] = await Promise.all([
    prisma.payRun.findMany({ where, orderBy: [{ year: "desc" }, { month: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.payRun.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

payroll.get("/runs/:id", requireAuth, requirePermission("payroll:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const run = await prisma.payRun.findUnique({
    where: { id },
    include: { payslips: { include: { employee: { select: { code: true, name: true } } } } },
  });
  assertSameArea(user, run);
  return ok(c, run);
});

/** Compute (or recompute) the pay run for a period. */
payroll.post("/runs", requireAuth, requirePermission("payroll:write"), async (c) => {
  const user = c.get("user");
  const { year, month } = payRunSchema.parse(await c.req.json());
  const run = await computePayRun(user.dataAreaId, year, month, user.id);
  await logActivity({ userId: user.id, action: "COMPUTE", target: `PayRun:${run.id}`, detail: { period: `${year}-${month}` } });
  return created(c, run);
});

payroll.post("/runs/:id/approve", requireAuth, requirePermission("payroll:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.payRun.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const run = await approvePayRun(id, user.id);
  await logActivity({ userId: user.id, action: "APPROVE", target: `PayRun:${id}` });
  return ok(c, run);
});

/** Post an approved run to the ledger. */
payroll.post("/runs/:id/post", requireAuth, requirePermission("payroll:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.payRun.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const entry = await postPayRun(id, user.id);
  await logActivity({ userId: user.id, action: "POST", target: `PayRun:${id}`, detail: { voucherNumber: entry.voucherNumber } });
  return ok(c, entry);
});
