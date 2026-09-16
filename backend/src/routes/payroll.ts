import { Hono } from "hono";
import { Prisma, EmployeeStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  employeeSchema, payRunSchema, paginationSchema,
  statutorySchemeSchema, statutoryDeductionSchema, optInSchema,
} from "@backend/lib/validations";
import { schemeFor, allSchemes } from "@backend/services/statutory-schemes";
import { AuthError } from "@backend/lib/errors";
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
      ...body,
      dataAreaId: areaForWrite(user, body.dataAreaId),
      nationalId: body.nationalId || null,
      tin: body.tin || null,
      country: body.country.toUpperCase(),
      bankAccount: body.bankAccount || null,
      // Blank strings from the form mean "not given", not an empty value.
      gender: body.gender || null,
      religion: body.religion || null,
      nationality: body.nationality ? body.nationality.toUpperCase() : null,
      passportNumber: body.passportNumber || null,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      emergencyContactName: body.emergencyContactName || null,
      emergencyContactPhone: body.emergencyContactPhone || null,
      guarantorName: body.guarantorName || null,
      guarantorContact: body.guarantorContact || null,
      guarantorDetails: body.guarantorDetails || null,
      educationLevel: body.educationLevel || null,
      previousEmployer: body.previousEmployer || null,
      vettingRemarks: body.vettingRemarks || null,
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
    // Lines are what make a slip explainable: each carries the basis and rate
    // it was computed from.
    include: { payslips: { include: { employee: { select: { code: true, name: true } }, lines: { orderBy: { sortOrder: "asc" } } } } },
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

// ── Statutory schemes: the regulations as settings ───────────────────────────
//
// Priyam's answer to the payroll question: the rules live in the backend, the
// customer selects a country. These are the routes that make them editable, so
// a budget-year rate change is an edit by an administrator rather than a
// release. Global rather than per tenant, because the law is the same for
// everyone in a country; hence company:manage rather than payroll:write.

/** Every scheme on file, with its deductions. Seeds any the seed knows about. */
payroll.get("/schemes", requireAuth, requirePermission("payroll:read"), async (c) => {
  return ok(c, await allSchemes());
});

/**
 * Amend a scheme's PAYE bands, source or verification date.
 *
 * `verifiedAt` is the accountant's sign-off. Until it is set, the payroll
 * screen shows the scheme as unverified, because a seed is a starting point
 * and not the law.
 */
payroll.patch("/schemes/:country", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const country = c.req.param("country").toUpperCase();
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = statutorySchemeSchema.parse(raw);
  await schemeFor(country); // seeds it if it is missing, so a patch can never 404 on a known country
  const existing = await prisma.statutoryScheme.findUniqueOrThrow({ where: { country }, select: { id: true } });
  const row = await updateWithVersion(prisma.statutoryScheme, existing.id, version, user.id, {
    name: body.name,
    currency: body.currency,
    payeBands: body.payeBands,
    source: body.source || null,
    verifiedAt: body.verifiedAt ?? null,
    isActive: body.isActive,
  });
  await logActivity({ userId: user.id, action: "UPDATE", target: `StatutoryScheme:${country}` });
  return ok(c, row);
});

/** Amend one deduction's rates, basis, cap or opt-in flag. */
payroll.put("/schemes/:country/deductions/:code", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const country = c.req.param("country").toUpperCase();
  const code = c.req.param("code").toUpperCase();
  const body = statutoryDeductionSchema.parse(await c.req.json());
  await schemeFor(country);
  const scheme = await prisma.statutoryScheme.findUniqueOrThrow({ where: { country }, select: { id: true } });
  const data = {
    label: body.label,
    employeeRatePct: body.employeeRatePct,
    employerRatePct: body.employerRatePct,
    basis: body.basis,
    basisCap: body.basisCap ?? null,
    minAmount: body.minAmount ?? null,
    fixedAmount: body.fixedAmount ?? null,
    reducesTaxable: body.reducesTaxable,
    optIn: body.optIn,
    sortOrder: body.sortOrder,
    isActive: body.isActive,
  };
  const row = await prisma.statutoryDeduction.upsert({
    where: { schemeId_code: { schemeId: scheme.id, code } },
    create: { schemeId: scheme.id, code, ...data },
    update: data,
  });
  await logActivity({ userId: user.id, action: "UPSERT", target: `StatutoryDeduction:${country}/${code}` });
  return ok(c, row);
});

// ── Per-employee opt-ins: union membership, loan repayment ───────────────────

payroll.get("/employees/:id/opt-ins", requireAuth, requirePermission("payroll:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const emp = await prisma.employee.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, emp);
  return ok(c, await prisma.employeeDeductionOptIn.findMany({ where: { employeeId: id }, orderBy: { code: "asc" } }));
});

payroll.put("/employees/:id/opt-ins/:code", requireAuth, requirePermission("payroll:write"), async (c) => {
  const user = c.get("user");
  const { id, code } = c.req.param();
  const emp = await prisma.employee.findUnique({ where: { id }, select: { dataAreaId: true, country: true } });
  assertSameArea(user, emp);
  // The code has to exist in the employee's own country's scheme, or the
  // opt-in would sit there doing nothing and look like a deduction that is
  // silently failing.
  const scheme = await schemeFor(emp!.country);
  const upper = code.toUpperCase();
  if (!scheme.deductions.some((d) => d.code === upper && d.optIn)) {
    throw new AuthError(`${upper} is not an opt-in deduction in the ${scheme.country} scheme`, 422);
  }
  const body = optInSchema.parse(await c.req.json());
  const row = await prisma.employeeDeductionOptIn.upsert({
    where: { employeeId_code: { employeeId: id, code: upper } },
    create: { employeeId: id, code: upper, amountOverride: body.amountOverride ?? null, reference: body.reference || null },
    update: { amountOverride: body.amountOverride ?? null, reference: body.reference || null },
  });
  await logActivity({ userId: user.id, action: "UPSERT", target: `EmployeeDeductionOptIn:${id}/${upper}` });
  return ok(c, row);
});

payroll.delete("/employees/:id/opt-ins/:code", requireAuth, requirePermission("payroll:write"), async (c) => {
  const user = c.get("user");
  const { id, code } = c.req.param();
  const emp = await prisma.employee.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, emp);
  await prisma.employeeDeductionOptIn.deleteMany({ where: { employeeId: id, code: code.toUpperCase() } });
  await logActivity({ userId: user.id, action: "DELETE", target: `EmployeeDeductionOptIn:${id}/${code}` });
  return ok(c, { id, code });
});
