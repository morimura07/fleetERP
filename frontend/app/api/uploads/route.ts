import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError, error } from "@/lib/api";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/** Proof-of-delivery image upload. Returns a public URL under /uploads. */
export async function POST(req: NextRequest) {
  try {
    await requirePermission("report:write");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error("No file provided", 400);
    if (!ALLOWED.includes(file.type)) return error("Unsupported file format", 415);
    if (file.size > MAX_BYTES) return error("File is too large", 413);

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const name = `${randomUUID()}.${ext}`;
    const dir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public/uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

    return ok({ url: `/uploads/${name}` });
  } catch (e) {
    return handleError(e);
  }
}
