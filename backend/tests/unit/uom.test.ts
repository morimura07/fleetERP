import { describe, it, expect } from "vitest";
import { convertQuantity, type ConvertibleUnit } from "@backend/services/uom";
import { AuthError } from "@backend/lib/errors";

const KG: ConvertibleUnit = { code: "KG", dimension: "WEIGHT", factorToBase: 1 };
const TON: ConvertibleUnit = { code: "TON", dimension: "WEIGHT", factorToBase: 1000 };
const G: ConvertibleUnit = { code: "G", dimension: "WEIGHT", factorToBase: 0.001 };
const L: ConvertibleUnit = { code: "L", dimension: "VOLUME", factorToBase: 1 };

describe("UoM conversion (M30)", () => {
  it("converts up-dimension: 2 TON → 2000 KG", () => {
    expect(convertQuantity(2, TON, KG)).toBe(2000);
  });

  it("converts down-dimension: 500 KG → 0.5 TON", () => {
    expect(convertQuantity(500, KG, TON)).toBe(0.5);
  });

  it("converts across two non-base units: 2 TON → 2_000_000 G", () => {
    expect(convertQuantity(2, TON, G)).toBe(2_000_000);
  });

  it("is identity when the units match", () => {
    expect(convertQuantity(7.5, KG, KG)).toBe(7.5);
  });

  it("refuses to convert across dimensions (KG → L)", () => {
    expect(() => convertQuantity(1, KG, L)).toThrow(AuthError);
    expect(() => convertQuantity(1, KG, L)).toThrow(/different dimensions/);
  });

  it("rejects a non-positive target factor", () => {
    const bad: ConvertibleUnit = { code: "BAD", dimension: "WEIGHT", factorToBase: 0 };
    expect(() => convertQuantity(1, KG, bad)).toThrow(/non-positive/);
  });
});
