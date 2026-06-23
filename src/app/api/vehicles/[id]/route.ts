import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError } from "@/lib/api";
import { vehicleSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePermission("vehicle:read");
    const { id } = await params;
    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id },
      include: { maintenances: { orderBy: { date: "desc" } } },
    });
    return ok(vehicle);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("vehicle:write");
    const { id } = await params;
    const body = vehicleSchema.partial().parse(await req.json());
    const vehicle = await prisma.vehicle.update({ where: { id }, data: body });
    await logActivity({ userId: user.id, action: "UPDATE", target: `Vehicle:${id}`, detail: body });
    return ok(vehicle);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("vehicle:write");
    const { id } = await params;
    await prisma.vehicle.delete({ where: { id } });
    await logActivity({ userId: user.id, action: "DELETE", target: `Vehicle:${id}` });
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
