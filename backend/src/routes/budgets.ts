import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { budgetSchema, paginationSchema } from "@backend/lib/validations";
import { lineStatus } from "@backend/services/budget";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { areaScope, areaForWrite } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";

export const budgets = new Hono();

budgets.get("/", requireAuth, requirePermission("budget:read"), async (c) => {
  const user = c.get("user");
  const { page, pageSize, q } = paginationSchema.parse(c.req.query());

  const where: Prisma.BudgetWhereInput = {
    ...areaScope(user),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.budget.findMany({
      where,
      include: { lines: { orderBy: { costCenter: "asc" } } },
      orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.budget.count({ where }),
  ]);

  const items = rows.map((b) => ({ ...b, lines: b.lines.map(lineStatus) }));
  return ok(c, items, pageMeta(page, pageSize, total));
});

budgets.post("/", requireAuth, requirePermission("budget:write"), async (c) => {
  const user = c.get("user");
  const body = budgetSchema.parse(await c.req.json());

  const budget = await prisma.budget.create({
    data: {
      dataAreaId: areaForWrite(user, body.dataAreaId),
      name: body.name,
      fiscalYear: body.fiscalYear,
      control: body.control,
      isActive: body.isActive,
      createdById: user.id,
      lines: {
        create: body.lines.map((l) => ({
          kind: l.kind,
          costCenter: l.costCenter,
          accountCode: l.accountCode,
          amount: l.amount,
          note: l.note,
        })),
      },
    },
    include: { lines: true },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `Budget:${budget.id}` });
  return created(c, budget);
});
