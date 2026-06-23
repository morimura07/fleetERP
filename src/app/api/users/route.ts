import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError, pageMeta } from "@/lib/api";
import { paginationSchema } from "@/lib/validations";
import { hashPassword } from "@/lib/password";
import { logActivity } from "@/lib/activity";

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "DISPATCHER", "FINANCE", "DRIVER", "STAFF"]),
});

export async function GET(req: NextRequest) {
  try {
    await requirePermission("user:manage");
    const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {};
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where, select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);
    return ok(items, pageMeta(page, pageSize, total));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requirePermission("user:manage");
    const body = userSchema.parse(await req.json());
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email.toLowerCase(), role: body.role, passwordHash: await hashPassword(body.password) },
      select: { id: true, name: true, email: true, role: true },
    });
    await logActivity({ userId: admin.id, action: "CREATE", target: `User:${user.id}` });
    return created(user);
  } catch (e) {
    return handleError(e);
  }
}
