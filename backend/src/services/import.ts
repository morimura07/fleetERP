import ExcelJS from "exceljs";
import Papa from "papaparse";
import { z } from "zod";
import { AuthError } from "@backend/lib/errors";

/**
 * Bulk import from a spreadsheet (client requirements, Sept 2026, closing note
 * 2: "option to upload excel files data incase of migration from another
 * system").
 *
 * Two passes over the same file. The first validates and reports, writing
 * nothing; the second writes. The file is sent twice rather than held on the
 * server between them, so a commit can never apply rows that were never
 * validated, and there is no half-finished import to expire or clean up.
 *
 * Rows are validated through the very schemas the forms use. A migrated record
 * is then exactly as valid as a hand-entered one, and a rule only ever has to
 * be written once.
 */

// ── Reading the file ─────────────────────────────────────────────────────────

export interface SheetData {
  headers: string[];
  /** One object per row, keyed by header, values already text. */
  rows: Record<string, string>[];
}

/**
 * Ceiling on one import.
 *
 * A migration arrives in the low thousands. Past this the file is almost always
 * an export of the wrong thing, and the honest answer is to split it rather
 * than to hold an unbounded sheet in memory and time out mid-write.
 */
export const IMPORT_ROW_CAP = 5_000;

/** Excel hands back dates, numbers, formulas and rich text; the mapper wants text. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    // A formula cell carries its computed result; that is what the user sees.
    if (v.result !== undefined) return cellText(v.result);
    if (v.richText) return v.richText.map((p) => p.text).join("");
    if (typeof v.text === "string") return v.text;
    return "";
  }
  return String(value).trim();
}

export function parseCsv(text: string): SheetData {
  // Strip a byte-order mark, or the first header arrives as "﻿Plate".
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const rows = (parsed.data ?? []).map((r) =>
    Object.fromEntries(headers.map((h) => [h, (r[h] ?? "").toString().trim()])),
  );
  return { headers, rows };
}

export async function parseXlsx(buffer: Buffer): Promise<SheetData> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new AuthError("That workbook has no sheets", 422);

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = cellText(cell.value);
  });
  const clean = headers.map((h) => (h ?? "").trim());
  if (clean.filter(Boolean).length === 0) {
    throw new AuthError("The first row must hold the column headings", 422);
  }

  const rows: Record<string, string>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, index) => {
    if (index === 1) return;
    const out: Record<string, string> = {};
    let any = false;
    clean.forEach((h, i) => {
      if (!h) return;
      const text = cellText(row.getCell(i + 1).value);
      out[h] = text;
      if (text) any = true;
    });
    // Skip rows that are entirely blank: spreadsheets are full of them.
    if (any) rows.push(out);
  });

  return { headers: clean.filter(Boolean), rows };
}

export async function parseSheet(buffer: Buffer, filename: string): Promise<SheetData> {
  const lower = filename.toLowerCase();
  const data = lower.endsWith(".csv")
    ? parseCsv(buffer.toString("utf8"))
    : await parseXlsx(buffer);

  if (data.headers.length === 0) throw new AuthError("No column headings found", 422);
  if (data.rows.length === 0) throw new AuthError("The file has headings but no rows", 422);
  if (data.rows.length > IMPORT_ROW_CAP) {
    throw new AuthError(
      `That file holds ${data.rows.length.toLocaleString()} rows; imports are capped at ${IMPORT_ROW_CAP.toLocaleString()}. Split it and import in parts.`,
      422,
    );
  }
  return data;
}

// ── Matching their columns to ours ───────────────────────────────────────────

export interface ImportField {
  /** Field name on the target schema. */
  key: string;
  label: string;
  required: boolean;
  /** Header spellings seen in the wild, beyond the label and key. */
  aliases?: string[];
}

/** Header text reduced to something comparable: "Plate No." and "plate_no" match. */
function normalise(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type Mapping = Record<string, string>;

/**
 * Guess which of their columns feeds each of our fields.
 *
 * Nobody's export uses our field names, and asking someone to map thirty
 * columns by hand before they can see whether the file is even right is a good
 * way to have the import abandoned. The guess is always shown back for
 * correction rather than applied silently.
 */
export function autoMap(headers: string[], fields: ImportField[]): Mapping {
  const byNorm = new Map<string, string>();
  for (const h of headers) {
    const n = normalise(h);
    // First header wins, so a duplicate column cannot silently replace it.
    if (n && !byNorm.has(n)) byNorm.set(n, h);
  }

  const mapping: Mapping = {};
  const taken = new Set<string>();
  for (const f of fields) {
    for (const candidate of [f.key, f.label, ...(f.aliases ?? [])]) {
      const hit = byNorm.get(normalise(candidate));
      if (hit && !taken.has(hit)) {
        mapping[f.key] = hit;
        taken.add(hit);
        break;
      }
    }
  }
  return mapping;
}

/** Their row, rekeyed to our field names. Unmapped fields are simply absent. */
export function applyMapping(row: Record<string, string>, mapping: Mapping): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, header] of Object.entries(mapping)) {
    const value = row[header];
    if (value !== undefined && value !== "") out[field] = value;
  }
  return out;
}

// ── Validating ───────────────────────────────────────────────────────────────

export interface RowError {
  /** 1-based row number as the user sees it in the spreadsheet, header included. */
  row: number;
  field?: string;
  message: string;
}

export interface ValidationResult<T> {
  valid: { row: number; value: T }[];
  errors: RowError[];
}

/**
 * Run every row through the schema, collecting failures instead of stopping.
 *
 * Someone fixing a spreadsheet needs the whole list of problems, not the first
 * one. Reporting them one import at a time turns a ten-minute correction into
 * an afternoon.
 */
export function validateRows<S extends z.ZodTypeAny>(
  rows: Record<string, string>[],
  mapping: Mapping,
  schema: S,
): ValidationResult<z.infer<S>> {
  const valid: { row: number; value: z.infer<S> }[] = [];
  const errors: RowError[] = [];

  rows.forEach((raw, i) => {
    // +2: spreadsheets are 1-based and row 1 holds the headings.
    const rowNumber = i + 2;
    const mapped = applyMapping(raw, mapping);
    const result = schema.safeParse(mapped);
    if (result.success) {
      valid.push({ row: rowNumber, value: result.data });
    } else {
      for (const issue of result.error.issues) {
        errors.push({
          row: rowNumber,
          field: issue.path.join(".") || undefined,
          message: issue.message,
        });
      }
    }
  });

  return { valid, errors };
}

/**
 * Rows that repeat a natural key earlier in the same file.
 *
 * Returned rather than merged: two rows sharing a plate number is a mistake in
 * the sheet, and quietly keeping one of them hides it.
 */
export function findDuplicates<T>(
  valid: { row: number; value: T }[],
  naturalKey: (value: T) => string,
): RowError[] {
  const seen = new Map<string, number>();
  const errors: RowError[] = [];
  for (const { row, value } of valid) {
    const key = naturalKey(value).trim().toLowerCase();
    if (!key) continue;
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push({ row, message: `Duplicate of row ${first} in this file` });
    } else {
      seen.set(key, row);
    }
  }
  return errors;
}
