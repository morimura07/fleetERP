import { describe, it, expect } from "vitest";
import { toCsv } from "@backend/services/csv";
import {
  buildExport, isExportFormat, assertWithinCap, EXPORT_ROW_CAP, type ExportSpec,
} from "@backend/services/export";

interface Row { code: string; loss: number; when: Date; note: string | null }

const SPEC: ExportSpec<Row> = {
  title: "Incident Reports",
  columns: [
    { header: "Report", value: (r) => r.code },
    { header: "Loss", value: (r) => r.loss },
    { header: "Date", value: (r) => r.when },
    { header: "Note", value: (r) => r.note },
  ],
};

const rows: Row[] = [
  { code: "DMG-000001", loss: 1800, when: new Date("2026-09-01T00:00:00Z"), note: null },
  { code: "DMG-000002", loss: 250.5, when: new Date("2026-09-04T00:00:00Z"), note: "Wet damage, tarp torn" },
];

describe("export formats", () => {
  it("recognises only the three it can produce", () => {
    for (const f of ["csv", "xlsx", "pdf"]) expect(isExportFormat(f)).toBe(true);
    for (const f of ["docx", "json", "", "CSV"]) expect(isExportFormat(f)).toBe(false);
  });

  it("writes a CSV with a header and one line per row", async () => {
    const file = await buildExport("csv", SPEC, rows);
    const text = file.body.toString("utf8").replace(/^﻿/, "");
    const lines = text.trim().split(/\r?\n/);
    expect(lines[0]).toBe("Report,Loss,Date,Note");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("DMG-000001");
    expect(file.contentType).toContain("text/csv");
    expect(file.filename).toMatch(/^incident-reports-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("still writes the header when nothing matched the filters", async () => {
    // An empty file with no columns reads as a failed download, not as
    // "no rows matched".
    const file = await buildExport("csv", SPEC, []);
    const text = file.body.toString("utf8").replace(/^﻿/, "");
    expect(text.trim()).toBe("Report,Loss,Date,Note");
  });

  it("keeps the byte-order mark so Excel reads UTF-8", async () => {
    const file = await buildExport("csv", SPEC, rows);
    expect(file.body.toString("utf8").charCodeAt(0)).toBe(0xfeff);
  });

  it("quotes a value containing the delimiter", async () => {
    const file = await buildExport("csv", SPEC, [
      { code: "DMG-3", loss: 1, when: new Date("2026-01-01T00:00:00Z"), note: "torn, soaked" },
    ]);
    expect(file.body.toString("utf8")).toContain('"torn, soaked"');
  });

  it("writes a real xlsx, not a renamed CSV", async () => {
    const file = await buildExport("xlsx", SPEC, rows);
    // Every xlsx is a zip, so it starts "PK".
    expect(file.body.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(file.contentType).toContain("spreadsheetml");
    expect(file.filename.endsWith(".xlsx")).toBe(true);
  });

  it("writes a real pdf", async () => {
    const file = await buildExport("pdf", SPEC, rows);
    expect(file.body.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(file.contentType).toBe("application/pdf");
  });

  it("produces every format for an empty result without throwing", async () => {
    for (const f of ["csv", "xlsx", "pdf"] as const) {
      const file = await buildExport(f, SPEC, []);
      expect(file.body.length).toBeGreaterThan(0);
    }
  });

  it("names the file from the title and today's date", async () => {
    const file = await buildExport("csv", { title: "Dock Events", columns: SPEC.columns }, []);
    expect(file.filename).toMatch(/^dock-events-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe("export row cap", () => {
  it("allows a result exactly at the cap", () => {
    expect(() => assertWithinCap(EXPORT_ROW_CAP)).not.toThrow();
  });

  it("refuses one past it, and says how to proceed", () => {
    // The fetch asks for cap + 1 precisely so this is reachable without ever
    // holding an unbounded result in memory.
    expect(() => assertWithinCap(EXPORT_ROW_CAP + 1)).toThrow(/Narrow the filters/);
  });
});

describe("csv helper", () => {
  it("emits headers for an empty list when columns are given", () => {
    const csv = toCsv<{ a: string }>([], [{ key: "a", header: "Alpha" }]);
    expect(csv.replace(/^﻿/, "").trim()).toBe("Alpha");
  });

  it("renders a null cell as empty rather than the word null", () => {
    const csv = toCsv<{ a: string | null }>([{ a: null }], [{ key: "a", header: "Alpha" }]);
    // No trim here: the data row *is* an empty line, and trimming would remove
    // the very thing under test.
    const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
    expect(lines[0]).toBe("Alpha");
    expect(lines[1]).toBe("");
    expect(csv).not.toContain("null");
  });
});
