import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError } from "@/lib/api";
import { maintenanceSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePermission("vehicle:read");
    const { id } = await params;
    const items = await prisma.vehicleMaintenance.findMany({
      where: { vehicleId: id },
      orderBy: { date: "desc" },
    });
    return ok(items);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("vehicle:write");
    const { id } = await params;
    const body = maintenanceSchema.parse(await req.json());
    const item = await prisma.vehicleMaintenance.create({
      data: { ...body, vehicleId: id },
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `VehicleMaintenance:${item.id}` });
    return created(item);
  } catch (e) {
    return handleError(e);
  }
}
