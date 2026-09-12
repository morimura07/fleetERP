import ExcelJS from "exceljs";
import { toCsv } from "@backend/services/csv";
import { dataTablePdf } from "@backend/services/pdf";
import { AuthError } from "@backend/lib/errors";

/**
 * Turning any list into a file (client requirements, Sept 2026, closing note 3:
 * "option to export all data into excel and pdf").
 *
 * Exports are served by the list endpoints themselves rather than by a parallel
 * set of /export routes. That is the whole design: the same handler, the same
 * permission check, the same tenant scope and the same filters produce the file,
 * so an export can never contain rows the caller could not see on screen, and a
 * new filter never has to be implemented twice.
 */

export type ExportFormat = "csv" | "xlsx" | "pdf";

const FORMATS = ["csv", "xlsx", "pdf"] as const;

export function isExportFormat(value: string): value is ExportFormat {
  return (FORMATS as readonly string[]).includes(value);
}

export type CellValue = string | number | Date | null | undefined;

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => CellValue;
  /** Relative width. Used to proportion PDF columns and size Excel ones. */
  width?: number;
}

export interface ExportSpec<T> {
  /** Names the file, the worksheet and the PDF heading. */
  title: string;
  columns: ExportColumn<T>[];
}

/**
 * Ceiling on an export.
 *
 * An unbounded export is a way to run the server out of memory with one URL,
 * and a spreadsheet nobody can open is not a useful answer either. Past this
 * the caller is told to narrow the filters, which they can always do because
 * the export uses the same filters as the screen.
 */
export const EXPORT_ROW_CAP = 10_000;

export interface ExportFile {
  body: Buffer;
  contentType: string;
  filename: string;
}

/** "Dock Events" -> "dock-events-2026-09-12" */
function fileStem(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  return `${slug}-${new Date().toISOString().slice(0, 10)}`;
}

/** Dates as a plain day, numbers untouched, null as empty. */
function asText(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

export function assertWithinCap(total: number): void {
  if (total > EXPORT_ROW_CAP) {
    throw new AuthError(
      `That is ${total.toLocaleString()} rows; exports are capped at ${EXPORT_ROW_CAP.toLocaleString()}. Narrow the filters and try again.`,
      422,
    );
  }
}

export async function buildExport<T>(
  format: ExportFormat,
  spec: ExportSpec<T>,
  rows: T[],
): Promise<ExportFile> {
  assertWithinCap(rows.length);
  const stem = fileStem(spec.title);

  if (format === "csv") {
    // Header keys rather than field keys, so the column order survives and the
    // CSV reads the same as the screen.
    const data = rows.map((r) =>
      Object.fromEntries(spec.columns.map((c) => [c.header, asText(c.value(r))])),
    );
    const csv = toCsv(data, spec.columns.map((c) => ({ key: c.header, header: c.header })));
    return {
      body: Buffer.from(csv, "utf8"),
      contentType: "text/csv; charset=utf-8",
      filename: `${stem}.csv`,
    };
  }

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.created = new Date();
    // Excel refuses sheet names over 31 characters or containing []:*?/\
    const sheet = wb.addWorksheet(spec.title.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Export");

    sheet.columns = spec.columns.map((c) => ({
      header: c.header,
      key: c.header,
      width: Math.min(Math.max(c.width ?? c.header.length + 4, 10), 48),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const r of rows) {
      // Real numbers and dates, not their text. This is the reason for a true
      // xlsx rather than a CSV renamed: Excel reinterprets "03/04" by locale,
      // and totals cannot be taken over a column of strings.
      sheet.addRow(Object.fromEntries(spec.columns.map((c) => [c.header, c.value(r) ?? null])));
    }
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: spec.columns.length },
    };

    const body = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      body,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${stem}.xlsx`,
    };
  }

  const body = await dataTablePdf(
    spec.title,
    spec.columns.map((c) => c.header),
    rows.map((r) => spec.columns.map((c) => asText(c.value(r)))),
    spec.columns.map((c) => c.width ?? 1),
  );
  return { body, contentType: "application/pdf", filename: `${stem}.pdf` };
}
