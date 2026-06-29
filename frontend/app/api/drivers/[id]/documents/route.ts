import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError } from "@/lib/api";
import { driverDocumentSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePermission("driver:read");
    const { id } = await params;
    const items = await prisma.driverDocument.findMany({
      where: { driverId: id },
      orderBy: { expiresAt: "asc" },
    });
    return ok(items);
  } catch (e) {
    return handleError(e);
  }
}

/** Upsert a document by (driver, type) — one row per document type per driver. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("driver:write");
    const { id } = await params;
    const body = driverDocumentSchema.parse(await req.json());
    const item = await prisma.driverDocument.upsert({
      where: { driverId_type: { driverId: id, type: body.type } },
      create: { driverId: id, ...body },
      update: { number: body.number, issuedAt: body.issuedAt, expiresAt: body.expiresAt, note: body.note },
    });
    await logActivity({ userId: user.id, action: "UPSERT", target: `DriverDocument:${item.id}` });
    return created(item);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requirePermission("driver:write");
    const { id } = await params;
    const docId = req.nextUrl.searchParams.get("docId");
    if (docId) await prisma.driverDocument.delete({ where: { id: docId, driverId: id } });
    return ok({ id: docId });
  } catch (e) {
    return handleError(e);
  }
}
