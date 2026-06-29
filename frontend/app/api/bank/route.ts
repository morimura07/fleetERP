import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { bankAccountSchema, paginationSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { Prisma, BankAccountType } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("bank:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));
    const type = sp.get("type");

    const where: Prisma.BankAccountWhereInput = {
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(type && type in BankAccountType ? { type: type as BankAccountType } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.bankAccount.findMany({
        where,
        orderBy: { code: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.bankAccount.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("bank:write");
    const body = bankAccountSchema.parse(await req.json());
    const account = await prisma.bankAccount.create({
      data: {
        dataAreaId: body.dataAreaId,
        code: body.code,
        name: body.name,
        type: body.type,
        glCode: body.glCode,
        currency: body.currency,
        iban: body.iban || null,
        swift: body.swift || null,
        provider: body.provider || null,
        accountNo: body.accountNo || null,
        isActive: body.isActive,
      },
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `BankAccount:${account.id}` });
    return created(account);
  } catch (e) {
    return handleError(e);
  }
}
