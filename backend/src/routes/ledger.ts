import { Hono } from "hono";
import { Prisma, JournalStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { journalEntrySchema, idSchema, paginationSchema } from "@backend/lib/validations";
import {
  createJournalEntry,
  postJournalEntry,
  reverseJournalEntry,
} from "@backend/services/ledger";
import { logActivity } from "@backend/lib/activity";
import { can } from "@backend/lib/rbac";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";

export const ledger = new Hono();

ledger.get("/", requireAuth, requirePermission("ledger:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.JournalEntryWhereInput = {
    ...areaScope(user),
    ...(q
      ? {
          OR: [
            { voucherNumber: { contains: q, mode: "insensitive" } },
            { memo: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status && status in JournalStatus ? { status: status as JournalStatus } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      orderBy: { postingDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.journalEntry.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

ledger.post("/", requireAuth, async (c) => {
  // Posting immediately requires ledger:post; saving a draft needs ledger:write.
  const body = journalEntrySchema.parse(await c.req.json());
  const user = c.get("user");
  if (!can(user.role, body.post ? "ledger:post" : "ledger:write")) {
    throw new AuthError("You do not have permission", 403);
  }

  const entry = await createJournalEntry(
    {
      dataAreaId: areaForWrite(user, body.dataAreaId),
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
  return created(c, entry);
});

ledger.get("/:id", requireAuth, requirePermission("ledger:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  idSchema.parse(id);
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: { lines: { include: { account: { select: { code: true, name: true } } } } },
  });
  assertSameArea(user, entry);
  return ok(c, entry);
});

/** Action endpoint: { action: "post" | "reverse" }. */
ledger.post("/:id", requireAuth, requirePermission("ledger:post"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  idSchema.parse(id);
  const { action } = (await c.req.json()) as { action?: string };

  if (action === "post") {
    const entry = await postJournalEntry(id);
    await logActivity({ userId: user.id, action: "POST", target: `JournalEntry:${id}` });
    return ok(c, entry);
  }
  if (action === "reverse") {
    const reversal = await reverseJournalEntry(id, user.id);
    await logActivity({
      userId: user.id,
      action: "REVERSE",
      target: `JournalEntry:${id}`,
      detail: { reversalId: reversal.id },
    });
    return ok(c, reversal);
  }
  throw new AuthError("action must be 'post' or 'reverse'", 400);
});
