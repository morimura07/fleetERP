import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError, error } from "@/lib/api";
import { dispatchSchema } from "@/lib/validations";
import { checkDispatchConflict } from "@/lib/services/dispatch";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("dispatch:write");
    const { id } = await params;
    const body = dispatchSchema.parse(await req.json());

    const conflict = await checkDispatchConflict({ ...body, excludeDispatchId: id });
    if (conflict.hasConflict) {
      return error("There is a scheduling conflict in this time window", 409, conflict);
    }

    const dispatch = await prisma.dispatch.update({ where: { id }, data: body });
    await logActivity({ userId: user.id, action: "UPDATE", target: `Dispatch:${id}`, detail: body });
    return ok(dispatch);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("dispatch:write");
    const { id } = await params;
    const dispatch = await prisma.$transaction(async (tx) => {
      const d = await tx.dispatch.delete({ where: { id } });
      await tx.deliveryJob.update({ where: { id: d.jobId }, data: { status: "WAITING_DISPATCH" } });
      return d;
    });
    await logActivity({ userId: user.id, action: "DELETE", target: `Dispatch:${id}` });
    return ok({ id: dispatch.id });
  } catch (e) {
    return handleError(e);
  }
}
