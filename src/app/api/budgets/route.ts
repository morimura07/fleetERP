import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { budgetSchema, paginationSchema } from "@/lib/validations";
import { lineStatus } from "@/lib/services/budget";
import { logActivity } from "@/lib/activity";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("budget:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));

    const where: Prisma.BudgetWhereInput = q
      ? { name: { contains: q, mode: "insensitive" } }
      : {};

    const [budgets, total] = await Promise.all([
      prisma.budget.findMany({
        where,
        include: { lines: { orderBy: { costCenter: "asc" } } },
        orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.budget.count({ where }),
    ]);

    const items = budgets.map((b) => ({
      ...b,
      lines: b.lines.map(lineStatus),
    }));
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("budget:write");
    const body = budgetSchema.parse(await req.json());

    const budget = await prisma.budget.create({
      data: {
        dataAreaId: body.dataAreaId,
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
    return created(budget);
  } catch (e) {
    return handleError(e);
  }
}
