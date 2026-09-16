import Papa from "papaparse";

/** Serialize rows to CSV with a UTF-8 BOM so Excel renders Japanese correctly. */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns?: { key: keyof T; header: string }[],
): string {
  let csv: string;
  if (columns) {
    // `fields` + `data` rather than passing objects with a `columns` option:
    // given an empty list the latter emits nothing at all, so an export of a
    // filter that matched no rows downloaded as an empty file with no headers,
    // which reads as a broken download rather than as an empty result.
    csv = Papa.unparse({
      fields: columns.map((c) => c.header),
      data: rows.map((r) => columns.map((c) => r[c.key] ?? "")),
    });
  } else {
    csv = Papa.unparse(rows);
  }
  return "﻿" + csv;
}
