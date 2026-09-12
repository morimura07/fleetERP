import { Hono } from "hono";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { AttachmentKind } from "@prisma/client";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, effectiveRoleKey } from "@backend/lib/auth";
import { can } from "@backend/lib/rbac";
import { logActivity } from "@backend/lib/activity";
import { ok, created } from "@backend/lib/http";
import {
  ATTACHABLE, attachableTypes, isAttachableType, resolveOwner,
  recordAttachment, listAttachments, countAttachments, deleteAttachment, findAttachment,
} from "@backend/services/attachment";
import type { AuthUser } from "@backend/lib/auth";
import { uploadDir } from "@backend/routes/uploads";

/**
 * Documents attached to business records (client requirements, Sept 2026,
 * closing note 1: "there should be option of uploading documents to all
 * related fields").
 *
 * Permission is not static middleware here, because which permission applies
 * depends on what the file is being attached to. Uploading a licence scan
 * against a driver needs driver:write; the same endpoint attaching a quote to a
 * purchase order needs procurement:write.
 */

const MAX_BYTES = 16 * 1024 * 1024;

/**
 * Formats the client actually sends: photos from a phone, scanned paperwork,
 * and spreadsheets. Anything executable is absent on purpose — these files are
 * served back over HTTP and an allowlist is the control that makes that safe.
 */
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "text/csv": "csv",
  "text/plain": "txt",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export const attachments = new Hono();

function assertCan(user: AuthUser, entityType: string, mode: "read" | "write") {
  if (!isAttachableType(entityType)) {
    throw new AuthError(`Documents cannot be attached to ${entityType}`, 422);
  }
  if (!can(effectiveRoleKey(user), ATTACHABLE[entityType][mode])) {
    throw new AuthError("You do not have permission", 403);
  }
}

/** What this system will accept documents against, for the UI to offer. */
attachments.get("/types", requireAuth, (c) => ok(c, attachableTypes()));

/** Documents on one record. */
attachments.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const entityType = c.req.query("entityType") ?? "";
  const entityId = c.req.query("entityId") ?? "";
  if (!entityId) throw new AuthError("entityId is required", 422);
  assertCan(user, entityType, "read");
  return ok(c, await listAttachments(user, entityType, entityId));
});

/** Document counts for a page of records, for the evidence-count badge. */
attachments.get("/counts", requireAuth, async (c) => {
  const user = c.get("user");
  const entityType = c.req.query("entityType") ?? "";
  const ids = (c.req.query("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  assertCan(user, entityType, "read");
  return ok(c, await countAttachments(user, entityType, ids));
});

attachments.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const form = await c.req.formData();

  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");
  assertCan(user, entityType, "write");
  // Proves the record exists in this tenant before a byte is written to disk,
  // so a rejected upload leaves no orphan file behind.
  await resolveOwner(user, entityType, entityId);

  const file = form.get("file");
  if (!(file instanceof File)) throw new AuthError("No file provided", 400);
  const ext = ALLOWED[file.type];
  if (!ext) throw new AuthError(`Unsupported file format: ${file.type || "unknown"}`, 415);
  if (file.size > MAX_BYTES) throw new AuthError(`File is larger than ${MAX_BYTES / 1024 / 1024}MB`, 413);
  if (file.size === 0) throw new AuthError("File is empty", 400);

  const kindRaw = String(form.get("kind") ?? "OTHER");
  const kind = (Object.values(AttachmentKind) as string[]).includes(kindRaw)
    ? (kindRaw as AttachmentKind)
    : AttachmentKind.OTHER;

  // Stored under a generated name: the original is kept only as a label, so a
  // file called "../../etc/passwd" cannot influence where it lands.
  const stored = `${randomUUID()}.${ext}`;
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, stored), Buffer.from(await file.arrayBuffer()));

  const row = await recordAttachment(user, {
    entityType,
    entityId,
    fileName: file.name.slice(0, 180) || stored,
    fileUrl: `/uploads/${stored}`,
    mimeType: file.type,
    sizeBytes: file.size,
    kind,
    note: (form.get("note") as string | null)?.slice(0, 500) || null,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `Attachment:${row.id}`, detail: { entityType, entityId } });
  return created(c, row);
});

attachments.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  // Read first, then check the permission the owning module requires, then
  // delete. Checking after the delete would have enforced nothing.
  const found = await findAttachment(user, c.req.param("id"));
  assertCan(user, found.entityType, "write");
  const removed = await deleteAttachment(user, found.id);
  // The file on disk is deliberately left in place. These are claim evidence and
  // compliance records; an accidental delete should be recoverable, and orphan
  // files are cheaper than a lost police report. A sweep can reclaim them later.
  await logActivity({ userId: user.id, action: "DELETE", target: `Attachment:${removed.id}` });
  return ok(c, { id: removed.id });
});
