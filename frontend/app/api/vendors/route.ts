import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { vendorSchema, paginationSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("vendor:read");
    const sp = req.nextUrl.searchParams;
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(sp));

    const where: Prisma.VendorWhereInput = q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { legalName: { contains: q, mode: "insensitive" } },
            { tin: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.vendor.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.vendor.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("vendor:write");
    const body = vendorSchema.parse(await req.json());
    const vendor = await prisma.vendor.create({
      data: { ...body, email: body.email || null },
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `Vendor:${vendor.id}` });
    return created(vendor);
  } catch (e) {
    return handleError(e);
  }
}
