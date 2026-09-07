import { Hono } from "hono";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@backend/lib/prisma";
import { paginationSchema } from "@backend/lib/validations";
import { hashPassword } from "@backend/lib/password";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { areaForWrite, areaScope } from "@backend/lib/scope";
import { ok, created, pageMeta } from "@backend/lib/http";

const ou = (max: number) => z.string().max(max).optional().or(z.literal(""));
const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "DISPATCHER", "FINANCE", "DRIVER", "STAFF"]),
  dataAreaId: z.string().min(1).max(10).optional(), // company the user belongs to
  // Profile & access (spec: Users §1–5)
  phone: ou(30),
  jobTitle: ou(120),
  assignedBranch: ou(120),
  costCenter: ou(80),
  approvalLimit: z.coerce.number().min(0).optional().nullable(),
  esignatory: z.boolean().default(false),
  languagePref: ou(40),
  timeZone: ou(40),
});

export const users = new Hono();

users.get("/", requireAuth, requirePermission("user:manage"), async (c) => {
  const user = c.get("user");
  const { page, pageSize, q } = paginationSchema.parse(c.req.query());
  // Without this an administrator reads every account in the system, including
  // the names, emails and roles of other tenants' staff. `POST` has always
  // scoped writes through `areaForWrite`; the list was missed.
  const where: Prisma.UserWhereInput = {
    ...areaScope(user),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, roleKey: true, dataAreaId: true, isActive: true, createdAt: true, approvalLimit: true, esignatory: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

users.post("/", requireAuth, requirePermission("user:manage"), async (c) => {
  const admin = c.get("user");
  const body = userSchema.parse(await c.req.json());
  // `areaForWrite` refuses a company outside the admin's own organization, so a
  // user can never be planted inside another tenant.
  const dataAreaId = areaForWrite(admin, body.dataAreaId);
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      role: body.role,
      dataAreaId,
      passwordHash: await hashPassword(body.password),
      phone: body.phone || null,
      jobTitle: body.jobTitle || null,
      assignedBranch: body.assignedBranch || null,
      costCenter: body.costCenter || null,
      approvalLimit: body.approvalLimit ?? null,
      esignatory: body.esignatory,
      languagePref: body.languagePref || null,
      timeZone: body.timeZone || null,
    },
    select: { id: true, name: true, email: true, role: true, dataAreaId: true },
  });
  await logActivity({ userId: admin.id, action: "CREATE", target: `User:${user.id}` });
  return created(c, user);
});
