import { Hono } from "hono";
import { Prisma, BankAccountType, TransferStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { bankAccountSchema, moneyTransferSchema, idSchema, paginationSchema } from "@backend/lib/validations";
import { settleTransfer, failTransfer } from "@backend/services/cash-bank";
import { logActivity } from "@backend/lib/activity";
import { can } from "@backend/lib/rbac";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { areaScope, areaForWrite } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";

export const bank = new Hono();

bank.get("/", requireAuth, requirePermission("bank:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const type = sp.type;

  const where: Prisma.BankAccountWhereInput = {
    ...areaScope(user),
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
    prisma.bankAccount.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.bankAccount.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

bank.post("/", requireAuth, requirePermission("bank:write"), async (c) => {
  const user = c.get("user");
  const body = bankAccountSchema.parse(await c.req.json());
  const account = await prisma.bankAccount.create({
    data: {
      dataAreaId: areaForWrite(user, body.dataAreaId),
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
  return created(c, account);
});

// ---- money transfers / driver disbursements ----
bank.get("/transfers", requireAuth, requirePermission("bank:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.MoneyTransferWhereInput = {
    ...areaScope(user),
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
  return ok(c, items, pageMeta(page, pageSize, total));
});

bank.post("/transfers", requireAuth, async (c) => {
  const body = moneyTransferSchema.parse(await c.req.json());
  const user = c.get("user");
  if (!can(user.role, body.post ? "bank:disburse" : "bank:write")) {
    throw new AuthError("You do not have permission", 403);
  }

  const transfer = await prisma.moneyTransfer.create({
    data: {
      dataAreaId: areaForWrite(user, body.dataAreaId),
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
    return created(c, { transfer, entry });
  }
  return created(c, { transfer });
});

/** Actions: { action: "settle" } | { action: "fail" | "timeout", externalRef? } */
bank.post("/transfers/:id", requireAuth, requirePermission("bank:disburse"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  idSchema.parse(id);
  const body = await c.req.json();

  if (body.action === "settle") {
    const entry = await settleTransfer(id, user.id);
    await logActivity({ userId: user.id, action: "SETTLE", target: `MoneyTransfer:${id}`, detail: { voucherNumber: entry.voucherNumber } });
    return ok(c, entry);
  }
  if (body.action === "fail" || body.action === "timeout") {
    const status = body.action === "fail" ? "FAILED" : "TIMEOUT";
    const transfer = await failTransfer(id, status, body.externalRef);
    await logActivity({ userId: user.id, action: status, target: `MoneyTransfer:${id}` });
    return ok(c, transfer);
  }
  throw new AuthError("action must be 'settle', 'fail', or 'timeout'", 400);
});
