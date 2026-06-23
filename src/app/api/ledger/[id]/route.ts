import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError, error } from "@/lib/api";
import { idSchema } from "@/lib/validations";
import { postJournalEntry, reverseJournalEntry } from "@/lib/services/ledger";
import { logActivity } from "@/lib/activity";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("ledger:read");
    const { id } = await params;
    idSchema.parse(id);
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: { include: { account: { select: { code: true, name: true } } } },
      },
    });
    if (!entry) return error("Not found", 404);
    return ok(entry);
  } catch (e) {
    return handleError(e);
  }
}

/** Action endpoint: { action: "post" | "reverse" }. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("ledger:post");
    const { id } = await params;
    idSchema.parse(id);
    const { action } = (await req.json()) as { action?: string };

    if (action === "post") {
      const entry = await postJournalEntry(id);
      await logActivity({ userId: user.id, action: "POST", target: `JournalEntry:${id}` });
      return ok(entry);
    }
    if (action === "reverse") {
      const reversal = await reverseJournalEntry(id, user.id);
      await logActivity({
        userId: user.id,
        action: "REVERSE",
        target: `JournalEntry:${id}`,
        detail: { reversalId: reversal.id },
      });
      return ok(reversal);
    }
    return error("action must be 'post' or 'reverse'", 400);
  } catch (e) {
    return handleError(e);
  }
}
