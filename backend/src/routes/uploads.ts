import { Hono } from "hono";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { AuthError } from "@backend/lib/errors";
import { requireAuth } from "@backend/lib/auth";
import { can } from "@backend/lib/rbac";
import { ok } from "@backend/lib/http";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export const uploadDir = () => process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

export const uploads = new Hono();

/**
 * Image upload (proof-of-delivery reports and expense-claim receipts).
 * Returns a public URL under /uploads. Any user who can file a report or an
 * expense claim may upload.
 */
uploads.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  if (!can(user.role, "report:write") && !can(user.role, "expense:write")) {
    throw new AuthError("You do not have permission to upload", 403);
  }
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AuthError("No file provided", 400);
  if (!ALLOWED.includes(file.type)) throw new AuthError("Unsupported file format", 415);
  if (file.size > MAX_BYTES) throw new AuthError("File is too large", 413);

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const name = `${randomUUID()}.${ext}`;
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

  return ok(c, { url: `/uploads/${name}` });
});
