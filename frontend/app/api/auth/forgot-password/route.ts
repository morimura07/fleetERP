import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, handleError, error } from "@/lib/api";
import { forgotPasswordSchema } from "@/lib/validations";
import { generateToken } from "@/lib/password";
import { sendPasswordResetEmail } from "@/lib/mail";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`forgot:${ip}`, 5, 60_000).success) {
      return error("Too many requests. Please wait a moment", 429);
    }

    const { email } = forgotPasswordSchema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Always respond success to avoid leaking which emails exist.
    if (user) {
      const token = generateToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpires: new Date(Date.now() + 3600_000) },
      });
      const url = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
      await sendPasswordResetEmail(user.email, url).catch((e) =>
        console.error("[forgot] mail failed", e),
      );
    }
    return ok({ success: true });
  } catch (e) {
    return handleError(e);
  }
}
