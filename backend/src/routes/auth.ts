import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@backend/lib/prisma";
import { authenticate, signToken, requireAuth, effectiveRoleKey } from "@backend/lib/auth";
import { permissionsFor } from "@backend/lib/rbac";
import { forgotPasswordSchema, resetPasswordSchema } from "@backend/lib/validations";
import { generateToken, hashPassword } from "@backend/lib/password";
import { sendPasswordResetEmail } from "@backend/lib/mail";
import { rateLimit } from "@backend/lib/rate-limit";
import { logActivity } from "@backend/lib/activity";
import { AuthError } from "@backend/lib/errors";
import { ok } from "@backend/lib/http";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const auth = new Hono();

/** POST /auth/login → { accessToken, user } */
auth.post("/login", async (c) => {
  const ip = c.req.header("x-forwarded-for") ?? "local";
  if (!rateLimit(`login:${ip}`, 10, 60_000).success) {
    throw new AuthError("Too many requests. Please wait a moment", 429);
  }
  const { email, password } = loginSchema.parse(await c.req.json());
  const user = await authenticate(email, password);
  const accessToken = await signToken(user);
  await logActivity({ userId: user.id, action: "LOGIN", target: `User:${user.id}`, ipAddress: ip });
  return ok(c, { accessToken, user });
});

/** GET /auth/me → the current principal + its effective permission keys (for the UI). */
auth.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  return ok(c, { ...user, permissions: permissionsFor(effectiveRoleKey(user)) });
});

/** POST /auth/forgot-password — always responds success (no email enumeration). */
auth.post("/forgot-password", async (c) => {
  const ip = c.req.header("x-forwarded-for") ?? "local";
  if (!rateLimit(`forgot:${ip}`, 5, 60_000).success) {
    throw new AuthError("Too many requests. Please wait a moment", 429);
  }

  const { email } = forgotPasswordSchema.parse(await c.req.json());
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (user) {
    const token = generateToken();
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpires: new Date(Date.now() + 3600_000) },
    });
    const url = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, url).catch((e) => console.error("[forgot] mail failed", e));
  }
  return ok(c, { success: true });
});

/** POST /auth/reset-password — consume a valid token and set a new password. */
auth.post("/reset-password", async (c) => {
  const { token, password } = resetPasswordSchema.parse(await c.req.json());
  const user = await prisma.user.findUnique({ where: { resetToken: token } });
  if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
    throw new AuthError("The token is invalid or expired", 400);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), resetToken: null, resetTokenExpires: null },
  });
  await logActivity({ userId: user.id, action: "UPDATE", target: `User:${user.id}`, detail: "password reset" });
  return ok(c, { success: true });
});
