import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { requireAuth, effectiveRoleKey } from "@backend/lib/auth";
import { can } from "@backend/lib/rbac";
import { logActivity } from "@backend/lib/activity";
import { ok } from "@backend/lib/http";
import {
  parseSheet, autoMap, validateRows, findDuplicates, IMPORT_ROW_CAP,
  type Mapping, type RowError,
} from "@backend/services/import";
import {
  importResource, importableNames, describeWriteFailure, IMPORTABLE,
} from "@backend/services/import-resources";
import type { AuthUser } from "@backend/lib/auth";

/**
 * Spreadsheet import for migrating off another system.
 *
 * Preview first, commit second, with the file sent both times. Holding the
 * parsed rows server-side between the two would mean sessions to expire and
 * half-finished imports to clean up, and would let a commit apply something the
 * preview never checked.
 */

const MAX_BYTES = 12 * 1024 * 1024;

const ALLOWED = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const imports = new Hono();

function assertCan(user: AuthUser, resource: string, mode: "read" | "write") {
  const spec = importResource(resource);
  if (!can(effectiveRoleKey(user), spec[mode])) {
    throw new AuthError("You do not have permission", 403);
  }
  return spec;
}

/** Read the uploaded sheet, or explain why it could not be read. */
async function readUpload(c: Context) {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AuthError("No file provided", 400);
  if (file.size === 0) throw new AuthError("That file is empty", 400);
  if (file.size > MAX_BYTES) throw new AuthError(`File is larger than ${MAX_BYTES / 1024 / 1024}MB`, 413);
  // Some browsers send an empty type for .csv, so the extension is the fallback.
  if (file.type && !ALLOWED.has(file.type) && !file.name.toLowerCase().endsWith(".csv")) {
    throw new AuthError("Upload a .csv or .xlsx file", 415);
  }

  const sheet = await parseSheet(Buffer.from(await file.arrayBuffer()), file.name);
  const raw = form.get("mapping");
  // A mapping supplied by the client overrides the guess, field by field.
  const override = typeof raw === "string" && raw ? (JSON.parse(raw) as Mapping) : null;
  return { sheet, override, fileName: file.name };
}

/** What can be imported, and which columns each expects. */
imports.get("/", requireAuth, (c) =>
  ok(
    c,
    importableNames().map((name) => ({
      name,
      title: IMPORTABLE[name].title,
      rowCap: IMPORT_ROW_CAP,
      fields: IMPORTABLE[name].fields,
    })),
  ),
);

/**
 * Dry run. Reports what would happen and writes nothing.
 */
imports.post("/:resource/preview", requireAuth, async (c) => {
  const user = c.get("user");
  const resource = c.req.param("resource");
  const spec = assertCan(user, resource, "write");
  const { sheet, override } = await readUpload(c);

  const mapping: Mapping = { ...autoMap(sheet.headers, spec.fields), ...(override ?? {}) };

  const missingRequired = spec.fields
    .filter((f) => f.required && !mapping[f.key])
    .map((f) => f.label);

  const { valid, errors } = validateRows(sheet.rows, mapping, spec.schema);
  const duplicates = findDuplicates(valid, spec.naturalKey);

  // Which of these already exist, so the user is not surprised by a clash at
  // commit time. Blank keys are dropped: they fail validation anyway.
  const keys = valid.map((v) => spec.naturalKey(v.value)).filter(Boolean);
  const already = keys.length ? await spec.existing(user, keys) : [];
  const alreadySet = new Set(already.map((k) => k.toLowerCase()));
  const clashes: RowError[] = valid
    .filter((v) => alreadySet.has(spec.naturalKey(v.value).toLowerCase()))
    .map((v) => ({ row: v.row, message: `${spec.naturalKey(v.value)} already exists here` }));

  const blocking = [...errors, ...duplicates, ...clashes];

  return ok(c, {
    resource,
    title: spec.title,
    totalRows: sheet.rows.length,
    willImport: blocking.length === 0 ? valid.length : 0,
    mapping,
    // Columns of theirs nothing consumed, so a mis-mapped sheet is visible.
    unmappedHeaders: sheet.headers.filter((h) => !Object.values(mapping).includes(h)),
    missingRequired,
    // Capped: a thousand identical complaints helps nobody, and the response
    // has to stay a size the browser can render.
    errors: blocking.slice(0, 200),
    errorCount: blocking.length,
    sample: valid.slice(0, 5).map((v) => v.value),
  });
});

/**
 * Apply the import, all or nothing.
 *
 * A migration that half-succeeded is worse than one that failed: nobody can
 * tell what is in the system without checking every row by hand. Re-running a
 * corrected file is cheap; reconciling a partial import is not.
 */
imports.post("/:resource/commit", requireAuth, async (c) => {
  const user = c.get("user");
  const resource = c.req.param("resource");
  const spec = assertCan(user, resource, "write");
  const { sheet, override, fileName } = await readUpload(c);

  const mapping: Mapping = { ...autoMap(sheet.headers, spec.fields), ...(override ?? {}) };
  const { valid, errors } = validateRows(sheet.rows, mapping, spec.schema);
  const duplicates = findDuplicates(valid, spec.naturalKey);

  const keys = valid.map((v) => spec.naturalKey(v.value)).filter(Boolean);
  const already = keys.length ? await spec.existing(user, keys) : [];
  const alreadySet = new Set(already.map((k) => k.toLowerCase()));
  const clashes: RowError[] = valid
    .filter((v) => alreadySet.has(spec.naturalKey(v.value).toLowerCase()))
    .map((v) => ({ row: v.row, message: `${spec.naturalKey(v.value)} already exists here` }));

  const blocking = [...errors, ...duplicates, ...clashes];
  if (blocking.length > 0) {
    // Re-validated rather than trusted from the preview, so a file edited
    // between the two calls cannot slip past.
    throw new AuthError(
      `${blocking.length} row${blocking.length === 1 ? "" : "s"} still need fixing. Run the preview again.`,
      422,
    );
  }

  let written = 0;
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const { value } of valid) {
          await spec.insert(tx, user, value);
          written += 1;
        }
      },
      // A few thousand inserts comfortably exceeds the 5s default.
      { timeout: 120_000 },
    );
  } catch (e) {
    const failedRow = valid[written]?.row ?? 0;
    const detail = describeWriteFailure(e, failedRow);
    throw new AuthError(
      `Nothing was imported. Row ${detail.row}: ${detail.message}`,
      422,
    );
  }

  await logActivity({
    userId: user.id,
    action: "CREATE",
    target: `Import:${resource}`,
    detail: { rows: valid.length, file: fileName },
  });

  return ok(c, { resource, imported: valid.length });
});
