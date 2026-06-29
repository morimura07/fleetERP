import Papa from "papaparse";

/** Serialize rows to CSV with a UTF-8 BOM so Excel renders Japanese correctly. */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns?: { key: keyof T; header: string }[],
): string {
  let csv: string;
  if (columns) {
    const data = rows.map((r) =>
      Object.fromEntries(columns.map((c) => [c.header, r[c.key] ?? ""])),
    );
    csv = Papa.unparse(data, { columns: columns.map((c) => c.header) });
  } else {
    csv = Papa.unparse(rows);
  }
  return "﻿" + csv;
}
