import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { journalEntrySchema, paginationSchema } from "@/lib/validations";
import { createJournalEntry } from "@/lib/services/ledger";
import { logActivity } from "@/lib/activity";
import { Prisma, JournalStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("ledger:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));
    const status = sp.get("status");

    const where: Prisma.JournalEntryWhereInput = {
      ...(q
        ? {
            OR: [
              { voucherNumber: { contains: q, mode: "insensitive" } },
              { memo: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(status && status in JournalStatus
        ? { status: status as JournalStatus }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          lines: { include: { account: { select: { code: true, name: true } } } },
        },
        orderBy: { postingDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.journalEntry.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Posting immediately requires ledger:post; saving a draft needs ledger:write.
    const body = journalEntrySchema.parse(await req.json());
    const user = await requirePermission(body.post ? "ledger:post" : "ledger:write");

    const entry = await createJournalEntry(
      {
        dataAreaId: body.dataAreaId,
        postingDate: body.postingDate,
        currency: body.currency,
        exchangeRate: body.exchangeRate,
        memo: body.memo,
        lines: body.lines,
        createdById: user.id,
      },
      { post: body.post },
    );

    await logActivity({
      userId: user.id,
      action: body.post ? "POST" : "CREATE",
      target: `JournalEntry:${entry.id}`,
      detail: { voucherNumber: entry.voucherNumber, status: entry.status },
    });
    return created(entry);
  } catch (e) {
    return handleError(e);
  }
}
