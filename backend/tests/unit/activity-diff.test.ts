import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { diffFields } from "@backend/lib/activity";

describe("diffFields — field-level audit diff (M31)", () => {
  it("returns only the fields that actually changed", () => {
    const before = { name: "Acme", phone: "111", city: "Dar" };
    const after = { name: "Acme Ltd", phone: "111", city: "Kigali" };
    const d = diffFields(before, after);
    expect(d).toEqual([
      { field: "name", old: "Acme", new: "Acme Ltd" },
      { field: "city", old: "Dar", new: "Kigali" },
    ]);
  });

  it("returns nothing when nothing changed", () => {
    expect(diffFields({ a: 1, b: 2 }, { a: 1, b: 2 })).toEqual([]);
  });

  it("restricts the comparison to the `only` whitelist (ignores noise like updatedAt)", () => {
    const before = { name: "X", version: 1, updatedAt: new Date("2026-01-01") };
    const after = { name: "Y", version: 2, updatedAt: new Date("2026-02-02") };
    const d = diffFields(before, after, ["name"]);
    expect(d).toEqual([{ field: "name", old: "X", new: "Y" }]);
  });

  it("normalizes Dates to ISO strings on both sides", () => {
    const d = diffFields(
      { joinedAt: new Date("2025-01-01T00:00:00Z") },
      { joinedAt: new Date("2026-06-15T00:00:00Z") },
    );
    expect(d).toEqual([{ field: "joinedAt", old: "2025-01-01T00:00:00.000Z", new: "2026-06-15T00:00:00.000Z" }]);
  });

  it("treats an unchanged Date as no change despite different object identity", () => {
    const d = diffFields(
      { at: new Date("2026-01-01T00:00:00Z") },
      { at: new Date("2026-01-01T00:00:00Z") },
    );
    expect(d).toEqual([]);
  });

  it("compares Prisma.Decimal by value, not identity", () => {
    const changed = diffFields(
      { amount: new Prisma.Decimal("100.00") },
      { amount: new Prisma.Decimal("150.50") },
    );
    expect(changed).toEqual([{ field: "amount", old: "100", new: "150.5" }]);

    const same = diffFields(
      { amount: new Prisma.Decimal("100.00") },
      { amount: new Prisma.Decimal("100.0") },
    );
    expect(same).toEqual([]);
  });

  it("captures null → value and value → null transitions", () => {
    expect(diffFields({ note: null }, { note: "hi" })).toEqual([{ field: "note", old: null, new: "hi" }]);
    expect(diffFields({ note: "hi" }, { note: null })).toEqual([{ field: "note", old: "hi", new: null }]);
    expect(diffFields({ note: null }, { note: null })).toEqual([]);
  });

  it("skips whitelist fields that are absent from `after`", () => {
    const d = diffFields({ name: "A", extra: 1 }, { name: "B" }, ["name", "extra"]);
    expect(d).toEqual([{ field: "name", old: "A", new: "B" }]);
  });

  it("is null-safe on both sides", () => {
    expect(diffFields(null, null)).toEqual([]);
    expect(diffFields(null, undefined)).toEqual([]);
    expect(diffFields({ a: 1 }, null)).toEqual([]);
    // no before → every after field counts as a change
    expect(diffFields(null, { a: 1 })).toEqual([{ field: "a", old: null, new: 1 }]);
  });
});
