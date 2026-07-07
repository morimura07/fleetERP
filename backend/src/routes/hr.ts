import { Hono } from "hono";
import { Prisma, LeaveStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  contractSchema, leaveRequestSchema, entitlementSchema, employeeDocSchema, paginationSchema,
} from "@backend/lib/validations";
import {
  createContract, activateContract, endContract,
  requestLeave, reviewLeave, cancelLeave, setEntitlement,
  upsertDocument, expiringDocuments, remaining,
} from "@backend/services/hr";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const hr = new Hono();

// ── Employees (HR view over the existing Employee record) ────────────────────

/** List employees with a light HR summary (active contract title). */
hr.get("/employees", requireAuth, requirePermission("hr:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.EmployeeWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status && ["ACTIVE", "ON_LEAVE", "TERMINATED"].includes(status) ? { status: status as "ACTIVE" | "ON_LEAVE" | "TERMINATED" } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: { contracts: { where: { status: "ACTIVE" }, select: { title: true, type: true }, take: 1 } },
      orderBy: { code: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employee.count({ where }),
  ]);
  return ok(c, items.map((e) => ({ ...e, activeContract: e.contracts[0] ?? null })), pageMeta(page, pageSize, total));
});

/** Employee HR detail: contracts, leave requests, balances, documents. */
hr.get("/employees/:id", requireAuth, requirePermission("hr:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      contracts: { orderBy: { startDate: "desc" } },
      leaveRequests: { orderBy: { startDate: "desc" } },
      leaveBalances: { orderBy: [{ year: "desc" }, { type: "asc" }] },
      documents: { orderBy: { type: "asc" } },
    },
  });
  assertSameArea(user, employee);
  const balances = employee.leaveBalances.map((b) => ({ ...b, remaining: remaining(b.entitled, b.taken) }));
  return ok(c, { ...employee, leaveBalances: balances });
});

/** Documents needing attention (expiring/expired) across the company. */
hr.get("/documents/expiring", requireAuth, requirePermission("hr:read"), async (c) => {
  const user = c.get("user");
  const dataAreaId = areaForWrite(user);
  return ok(c, await expiringDocuments(dataAreaId));
});

// ── Contracts ────────────────────────────────────────────────────────────────

hr.post("/contracts", requireAuth, requirePermission("hr:write"), async (c) => {
  const user = c.get("user");
  const body = contractSchema.parse(await c.req.json());
  const contract = await createContract({
    dataAreaId: areaForWrite(user, body.dataAreaId),
    employeeId: body.employeeId,
    type: body.type,
    title: body.title,
    grossSalary: body.grossSalary,
    currency: body.currency,
    startDate: body.startDate,
    endDate: body.endDate ?? null,
    note: body.note ?? null,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `EmploymentContract:${contract.id}` });
  return created(c, contract);
});

/** Activate a DRAFT contract (ends the prior active one; syncs employee salary). */
hr.post("/contracts/:id/activate", requireAuth, requirePermission("hr:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.employmentContract.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const contract = await activateContract(existing.dataAreaId, id, user.id);
  await logActivity({ userId: user.id, action: "ACTIVATE", target: `EmploymentContract:${id}` });
  return ok(c, contract);
});

/** End a contract (termination / expiry). */
hr.post("/contracts/:id/end", requireAuth, requirePermission("hr:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.employmentContract.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const contract = await endContract(existing.dataAreaId, id, user.id);
  await logActivity({ userId: user.id, action: "END", target: `EmploymentContract:${id}` });
  return ok(c, contract);
});

// ── Leave ────────────────────────────────────────────────────────────────────

/** List leave requests (paginated, filterable by status), for the review queue. */
hr.get("/leave", requireAuth, requirePermission("hr:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.LeaveRequestWhereInput = {
    ...areaScope(user),
    ...(status && status in LeaveStatus ? { status: status as LeaveStatus } : {}),
    ...(q ? { employee: { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: { employee: { select: { code: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.leaveRequest.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

hr.post("/leave", requireAuth, requirePermission("hr:write"), async (c) => {
  const user = c.get("user");
  const body = leaveRequestSchema.parse(await c.req.json());
  const leave = await requestLeave({
    dataAreaId: areaForWrite(user, body.dataAreaId),
    employeeId: body.employeeId,
    type: body.type,
    startDate: body.startDate,
    endDate: body.endDate,
    reason: body.reason ?? null,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `LeaveRequest:${leave.id}` });
  return created(c, leave);
});

/** Approve/reject a pending request. Body: { approve: boolean }. */
hr.post("/leave/:id/review", requireAuth, requirePermission("hr:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.leaveRequest.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const { approve } = (await c.req.json()) as { approve?: boolean };
  const leave = await reviewLeave(existing.dataAreaId, id, approve !== false, user.id);
  await logActivity({ userId: user.id, action: approve !== false ? "APPROVE" : "REJECT", target: `LeaveRequest:${id}` });
  return ok(c, leave);
});

hr.post("/leave/:id/cancel", requireAuth, requirePermission("hr:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.leaveRequest.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const leave = await cancelLeave(existing.dataAreaId, id, user.id);
  await logActivity({ userId: user.id, action: "CANCEL", target: `LeaveRequest:${id}` });
  return ok(c, leave);
});

/** Grant/adjust a yearly leave entitlement for an employee. */
hr.post("/employees/:id/entitlement", requireAuth, requirePermission("hr:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.employee.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = entitlementSchema.parse(await c.req.json());
  const balance = await setEntitlement(existing.dataAreaId, id, body.type, body.year, body.entitled, user.id);
  await logActivity({ userId: user.id, action: "SET_ENTITLEMENT", target: `Employee:${id}`, detail: { type: body.type, year: body.year, entitled: body.entitled } });
  return ok(c, { ...balance, remaining: remaining(balance.entitled, balance.taken) });
});

// ── Documents ────────────────────────────────────────────────────────────────

hr.post("/employees/:id/documents", requireAuth, requirePermission("hr:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.employee.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = employeeDocSchema.parse(await c.req.json());
  const doc = await upsertDocument({
    dataAreaId: existing.dataAreaId,
    employeeId: id,
    type: body.type,
    number: body.number ?? null,
    issuedAt: body.issuedAt ?? null,
    expiresAt: body.expiresAt ?? null,
    fileUrl: body.fileUrl ?? null,
    note: body.note ?? null,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "UPSERT_DOC", target: `Employee:${id}`, detail: { type: body.type } });
  return ok(c, doc);
});
