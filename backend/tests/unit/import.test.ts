import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  parseCsv, autoMap, applyMapping, validateRows, findDuplicates,
  type ImportField,
} from "@backend/services/import";
import { IMPORTABLE, importableNames, importResource } from "@backend/services/import-resources";

const fields: ImportField[] = [
  { key: "plateNumber", label: "Plate number", required: true, aliases: ["registration", "reg no"] },
  { key: "maker", label: "Make", required: true, aliases: ["manufacturer"] },
  { key: "yearMade", label: "Year", required: false },
];

describe("reading a CSV", () => {
  it("takes the first row as headings", () => {
    const s = parseCsv("Plate number,Make\nT123ABC,Scania\nT456DEF,MAN\n");
    expect(s.headers).toEqual(["Plate number", "Make"]);
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0]).toEqual({ "Plate number": "T123ABC", Make: "Scania" });
  });

  it("strips a byte-order mark from the first heading", () => {
    // Excel writes one on every CSV it saves, and it would otherwise make the
    // first column unmappable for the least obvious reason imaginable.
    const s = parseCsv("﻿Plate number,Make\nT1,Scania\n");
    expect(s.headers[0]).toBe("Plate number");
  });

  it("trims whitespace around headings and values", () => {
    const s = parseCsv("  Plate number , Make \n  T123ABC , Scania \n");
    expect(s.headers).toEqual(["Plate number", "Make"]);
    expect(s.rows[0]["Plate number"]).toBe("T123ABC");
  });

  it("skips blank lines", () => {
    const s = parseCsv("Plate number,Make\nT1,Scania\n\n\nT2,MAN\n");
    expect(s.rows).toHaveLength(2);
  });
});

describe("guessing the column mapping", () => {
  it("matches on the field name", () => {
    expect(autoMap(["plateNumber", "maker"], fields)).toEqual({
      plateNumber: "plateNumber",
      maker: "maker",
    });
  });

  it("matches on the human label regardless of case, spaces and punctuation", () => {
    const m = autoMap(["PLATE_NUMBER", "  make  "], fields);
    expect(m.plateNumber).toBe("PLATE_NUMBER");
    expect(m.maker).toBe("  make  ");
  });

  it("matches on an alias, which is how real exports are headed", () => {
    const m = autoMap(["Reg No.", "Manufacturer"], fields);
    expect(m.plateNumber).toBe("Reg No.");
    expect(m.maker).toBe("Manufacturer");
  });

  it("leaves a field unmapped rather than guessing wildly", () => {
    const m = autoMap(["Something else"], fields);
    expect(m.plateNumber).toBeUndefined();
    expect(Object.keys(m)).toHaveLength(0);
  });

  it("never feeds one column into two fields", () => {
    // "Make" could plausibly answer to more than one field; the first wins and
    // the second stays unmapped, which is visible, rather than duplicated.
    const twoWantSame: ImportField[] = [
      { key: "a", label: "Make", required: false },
      { key: "b", label: "Make", required: false },
    ];
    const m = autoMap(["Make"], twoWantSame);
    expect(Object.values(m)).toEqual(["Make"]);
    expect(Object.keys(m)).toEqual(["a"]);
  });

  it("keeps the first of two identically named columns", () => {
    const m = autoMap(["Make", "Make"], fields);
    expect(m.maker).toBe("Make");
  });
});

describe("applying the mapping", () => {
  it("rekeys their headings to our field names", () => {
    const row = { "Reg No.": "T123ABC", Manufacturer: "Scania", Notes: "ignore me" };
    expect(applyMapping(row, { plateNumber: "Reg No.", maker: "Manufacturer" })).toEqual({
      plateNumber: "T123ABC",
      maker: "Scania",
    });
  });

  it("omits an empty cell so a schema default can apply", () => {
    // Passing "" would fail a min(1) rule instead of falling back to the default.
    const out = applyMapping({ A: "", B: "x" }, { plateNumber: "A", maker: "B" });
    expect(out).toEqual({ maker: "x" });
  });
});

const rowSchema = z.object({
  plateNumber: z.string().min(1),
  maker: z.string().min(1),
  yearMade: z.coerce.number().int().optional(),
});

describe("validating rows", () => {
  const mapping = { plateNumber: "Plate", maker: "Make", yearMade: "Year" };

  it("numbers rows the way the spreadsheet does", () => {
    const { valid } = validateRows([{ Plate: "T1", Make: "Scania" }], mapping, rowSchema);
    // Row 1 holds the headings, so the first record is row 2.
    expect(valid[0].row).toBe(2);
  });

  it("collects every failure rather than stopping at the first", () => {
    const { valid, errors } = validateRows(
      [
        { Plate: "T1", Make: "Scania" },
        { Plate: "", Make: "" },
        { Plate: "T3", Make: "MAN" },
      ],
      mapping,
      rowSchema,
    );
    expect(valid).toHaveLength(2);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.every((e) => e.row === 3)).toBe(true);
  });

  it("names the field that failed", () => {
    const { errors } = validateRows([{ Plate: "T1", Make: "" }], mapping, rowSchema);
    expect(errors[0].field).toBe("maker");
  });

  it("coerces text into the type the schema wants", () => {
    const { valid } = validateRows([{ Plate: "T1", Make: "Scania", Year: "2019" }], mapping, rowSchema);
    expect(valid[0].value.yearMade).toBe(2019);
  });
});

describe("duplicates within the file", () => {
  const key = (v: { plateNumber: string }) => v.plateNumber;

  it("reports the second occurrence and points at the first", () => {
    const errors = findDuplicates(
      [
        { row: 2, value: { plateNumber: "T123ABC" } },
        { row: 5, value: { plateNumber: "T123ABC" } },
      ],
      key,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(5);
    expect(errors[0].message).toContain("row 2");
  });

  it("treats keys case-insensitively", () => {
    const errors = findDuplicates(
      [
        { row: 2, value: { plateNumber: "t123abc" } },
        { row: 3, value: { plateNumber: "T123ABC" } },
      ],
      key,
    );
    expect(errors).toHaveLength(1);
  });

  it("ignores blank keys, which fail validation on their own", () => {
    const errors = findDuplicates(
      [
        { row: 2, value: { plateNumber: "" } },
        { row: 3, value: { plateNumber: "" } },
      ],
      key,
    );
    expect(errors).toHaveLength(0);
  });
});

describe("importable resources", () => {
  it("offers the master data a migration actually carries over", () => {
    expect(importableNames().sort()).toEqual(["clients", "drivers", "vehicles"]);
  });

  it("refuses anything else, and says what is available", () => {
    expect(() => importResource("orders")).toThrow(/Available: /);
    expect(() => importResource("")).toThrow();
  });

  it("declares at least one required field per resource", () => {
    for (const [name, spec] of Object.entries(IMPORTABLE)) {
      expect(spec.fields.some((f) => f.required), `${name} has no required field`).toBe(true);
    }
  });

  it("never repeats a field key within a resource", () => {
    for (const [name, spec] of Object.entries(IMPORTABLE)) {
      const keys = spec.fields.map((f) => f.key);
      expect(new Set(keys).size, `${name} repeats a field key`).toBe(keys.length);
    }
  });

  it("auto-maps a sheet headed with our own labels", () => {
    // The template we would hand a customer has to map cleanly to itself.
    for (const [name, spec] of Object.entries(IMPORTABLE)) {
      const headers = spec.fields.map((f) => f.label);
      const mapping = autoMap(headers, spec.fields);
      const required = spec.fields.filter((f) => f.required).map((f) => f.key);
      for (const key of required) {
        expect(mapping[key], `${name}.${key} did not map from its own label`).toBeDefined();
      }
    }
  });
});
