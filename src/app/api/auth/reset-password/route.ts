import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, handleError, error } from "@/lib/api";
import { resetPasswordSchema } from "@/lib/validations";
import { hashPassword } from "@/lib/password";
import { logActivity } from "@/lib/activity";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = resetPasswordSchema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      return error("The token is invalid or expired", 400);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        resetToken: null,
        resetTokenExpires: null,
      },
    });
    await logActivity({ userId: user.id, action: "UPDATE", target: `User:${user.id}`, detail: "password reset" });
    return ok({ success: true });
  } catch (e) {
    return handleError(e);
  }
}
