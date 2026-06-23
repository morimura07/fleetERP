import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError } from "@/lib/api";
import { clientSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePermission("client:read");
    const { id } = await params;
    const client = await prisma.client.findUniqueOrThrow({ where: { id } });
    return ok(client);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("client:write");
    const { id } = await params;
    const body = clientSchema.partial().parse(await req.json());
    const client = await prisma.client.update({ where: { id }, data: body });
    await logActivity({ userId: user.id, action: "UPDATE", target: `Client:${id}`, detail: body });
    return ok(client);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("client:write");
    const { id } = await params;
    await prisma.client.delete({ where: { id } });
    await logActivity({ userId: user.id, action: "DELETE", target: `Client:${id}` });
    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
