import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError } from "@/lib/api";
import { availabilitySchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePermission("driver:read");
    const { id } = await params;
    const items = await prisma.driverAvailability.findMany({
      where: { driverId: id },
      orderBy: { weekday: "asc" },
    });
    return ok(items);
  } catch (e) {
    return handleError(e);
  }
}

/** Upsert one weekday's working hours. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requirePermission("driver:write");
    const { id } = await params;
    const body = availabilitySchema.parse(await req.json());
    const item = await prisma.driverAvailability.upsert({
      where: { driverId_weekday: { driverId: id, weekday: body.weekday } },
      create: { ...body, driverId: id },
      update: body,
    });
    return created(item);
  } catch (e) {
    return handleError(e);
  }
}
