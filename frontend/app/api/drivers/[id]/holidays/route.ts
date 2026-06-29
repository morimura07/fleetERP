import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError } from "@/lib/api";
import { holidaySchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePermission("driver:read");
    const { id } = await params;
    const items = await prisma.holiday.findMany({
      where: { driverId: id },
      orderBy: { date: "asc" },
    });
    return ok(items);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requirePermission("driver:write");
    const { id } = await params;
    const body = holidaySchema.parse(await req.json());
    const item = await prisma.holiday.create({ data: { ...body, driverId: id } });
    return created(item);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requirePermission("driver:write");
    const { id } = await params;
    const holidayId = req.nextUrl.searchParams.get("holidayId");
    if (holidayId) await prisma.holiday.delete({ where: { id: holidayId } });
    return ok({ id: holidayId });
  } catch (e) {
    return handleError(e);
  }
}
