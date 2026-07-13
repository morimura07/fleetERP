import { Hono } from "hono";
import { Prisma, ProjectStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  projectSchema, projectStatusSchema, orderProjectSchema, paginationSchema,
} from "@backend/lib/validations";
import {
  createProject, setProjectStatus, setOrderProject, computeProjectPnL,
} from "@backend/services/projects";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const projects = new Hono();

/** List projects (paginated, searchable, filterable by status). */
projects.get("/", requireAuth, requirePermission("project:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;
  const where: Prisma.ProjectWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ projectCode: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status && status in ProjectStatus ? { status: status as ProjectStatus } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: { client: { select: { companyName: true } }, _count: { select: { orders: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

/** Create a project. */
projects.post("/", requireAuth, requirePermission("project:write"), async (c) => {
  const user = c.get("user");
  const body = projectSchema.parse(await c.req.json());
  const project = await createProject({
    dataAreaId: areaForWrite(user, undefined),
    name: body.name,
    clientId: body.clientId || null,
    manager: body.manager || null,
    currency: body.currency,
    budgetRevenue: body.budgetRevenue,
    budgetCost: body.budgetCost,
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
    description: body.description || null,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `Project:${project.id}` });
  return created(c, project);
});

/** Project detail with its budget-vs-actual P&L and linked orders. */
projects.get("/:id", requireAuth, requirePermission("project:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: { select: { companyName: true } },
      orders: {
        select: { id: true, orderCode: true, status: true, freightAmount: true, demurrageAmount: true, currency: true },
        orderBy: { bookingDate: "desc" },
      },
    },
  });
  assertSameArea(user, project);
  const pnl = await computeProjectPnL(project.dataAreaId, id);
  // Serialize Decimals in the P&L to strings for the JSON response.
  const pnlOut = Object.fromEntries(
    Object.entries(pnl).map(([k, v]) => [k, v instanceof Prisma.Decimal ? v.toFixed(2) : v]),
  );
  return ok(c, { ...project, pnl: pnlOut });
});

/** Advance the project's status (guarded transitions). */
projects.post("/:id/status", requireAuth, requirePermission("project:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.project.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = projectStatusSchema.parse(await c.req.json());
  const project = await setProjectStatus(existing.dataAreaId, id, body.status, user.id);
  await logActivity({ userId: user.id, action: "SET_STATUS", target: `Project:${id}`, detail: { status: body.status } });
  return ok(c, project);
});

/** Attach or detach a freight order from this project. */
projects.post("/:id/orders", requireAuth, requirePermission("project:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.project.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = orderProjectSchema.parse(await c.req.json());
  // projectId in the body decides attach (this project) vs detach (null).
  const order = await setOrderProject(existing.dataAreaId, body.orderId, body.projectId, user.id);
  await logActivity({ userId: user.id, action: body.projectId ? "ATTACH_ORDER" : "DETACH_ORDER", target: `Project:${id}`, detail: { orderId: body.orderId } });
  return ok(c, order);
});
