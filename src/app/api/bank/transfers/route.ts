import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { moneyTransferSchema, paginationSchema } from "@/lib/validations";
import { settleTransfer } from "@/lib/services/cash-bank";
import { logActivity } from "@/lib/activity";
import { Prisma, TransferStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("bank:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));
    const status = sp.get("status");

    const where: Prisma.MoneyTransferWhereInput = {
      ...(q
        ? {
            OR: [
              { reference: { contains: q, mode: "insensitive" } },
              { driver: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(status && status in TransferStatus ? { status: status as TransferStatus } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.moneyTransfer.findMany({
        where,
        include: {
          bankAccount: { select: { code: true, name: true, type: true } },
          driver: { select: { name: true } },
        },
        orderBy: { transferredAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.moneyTransfer.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = moneyTransferSchema.parse(await req.json());
    const user = await requirePermission(body.post ? "bank:disburse" : "bank:write");

    const transfer = await prisma.moneyTransfer.create({
      data: {
        dataAreaId: body.dataAreaId,
        reference: body.reference,
        bankAccountId: body.bankAccountId,
        driverId: body.driverId ?? null,
        type: body.type,
        amount: body.amount,
        currency: body.currency,
        expenseCode: body.expenseCode,
        externalRef: body.externalRef,
        transferredAt: body.transferredAt,
        memo: body.memo,
        createdById: user.id,
      },
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `MoneyTransfer:${transfer.id}` });

    if (body.post) {
      const entry = await settleTransfer(transfer.id, user.id);
      await logActivity({ userId: user.id, action: "SETTLE", target: `MoneyTransfer:${transfer.id}`, detail: { voucherNumber: entry.voucherNumber } });
      return created({ transfer, entry });
    }
    return created({ transfer });
  } catch (e) {
    return handleError(e);
  }
}
