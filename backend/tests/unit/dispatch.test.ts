import { describe, it, expect } from "vitest";
import { intervalsOverlap } from "@backend/services/dispatch";

describe("intervalsOverlap", () => {
  const d = (h: number) => new Date(2026, 5, 1, h);

  it("detects overlapping intervals", () => {
    expect(intervalsOverlap(d(9), d(12), d(11), d(13))).toBe(true);
  });

  it("treats touching endpoints as non-overlapping (half-open)", () => {
    expect(intervalsOverlap(d(9), d(12), d(12), d(14))).toBe(false);
  });

  it("detects full containment", () => {
    expect(intervalsOverlap(d(9), d(18), d(11), d(13))).toBe(true);
  });

  it("returns false for disjoint intervals", () => {
    expect(intervalsOverlap(d(9), d(10), d(14), d(16))).toBe(false);
  });
});
