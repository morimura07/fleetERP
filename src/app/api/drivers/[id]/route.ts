import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError } from "@/lib/api";
import { driverSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePermission("driver:read");
    const { id } = await params;
    const driver = await prisma.driver.findUniqueOrThrow({
      where: { id },
      include: { availability: true, holidays: { orderBy: { date: "asc" } } },
    });
    return ok(driver);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("driver:write");
    const { id } = await params;
    const body = driverSchema.partial().parse(await req.json());
    const driver = await prisma.driver.update({
      where: { id },
      data: {
        name: body.name,
        email: body.email?.toLowerCase(),
        phone: body.phone,
        address: body.address,
        contractType: body.contractType,
        joinedAt: body.joinedAt,
        status: body.status,
      },
    });
    await logActivity({ userId: user.id, action: "UPDATE", target: `Driver:${id}`, detail: body });
    return ok(driver);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("driver:write");
    const { id } = await params;
    await prisma.driver.delete({ where: { id } });
    await logActivity({ userId: user.id, action: "DELETE", target: `Driver:${id}` });
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
