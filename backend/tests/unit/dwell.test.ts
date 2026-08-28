import { describe, it, expect } from "vitest";
import { dwellFor, formatDwell, withDwell, DEFAULT_FREE_HOURS } from "@backend/services/operational-kpi";

const at = (iso: string) => new Date(iso);
const ev = (id: string, vehicleId: string, kind: "ARRIVAL" | "DEPARTURE", iso: string) =>
  ({ id, vehicleId, kind, eventAt: at(iso) });

describe("dwell time", () => {
  it("measures the gap between arrival and departure", () => {
    const r = dwellFor(at("2026-09-01T06:00:00Z"), at("2026-09-01T09:45:00Z"));
    expect(r.dwellHours).toBe(3.8); // 3h45m
    expect(r.detentionHours).toBe(0); // inside the 4h free period
  });

  it("reports detention only for the hours beyond the free period", () => {
    const r = dwellFor(at("2026-09-01T06:00:00Z"), at("2026-09-01T11:15:00Z"));
    expect(r.dwellHours).toBe(5.3);
    expect(r.detentionHours).toBe(1.3); // 5.25 - 4, not the whole stay
  });

  it("honours a different free period", () => {
    const r = dwellFor(at("2026-09-01T06:00:00Z"), at("2026-09-01T09:00:00Z"), 2);
    expect(r.detentionHours).toBe(1);
  });

  it("returns nulls while the truck is still on site", () => {
    expect(dwellFor(at("2026-09-01T06:00:00Z"), null)).toEqual({ dwellHours: null, detentionHours: null });
    expect(dwellFor(null, at("2026-09-01T06:00:00Z"))).toEqual({ dwellHours: null, detentionHours: null });
  });

  it("treats a departure logged before its arrival as zero, not negative", () => {
    // Data-entry error. Negative dwell would quietly flatter the average.
    const r = dwellFor(at("2026-09-01T10:00:00Z"), at("2026-09-01T08:00:00Z"));
    expect(r.dwellHours).toBe(0);
    expect(r.detentionHours).toBe(0);
  });

  it("defaults the free period to four hours", () => {
    expect(DEFAULT_FREE_HOURS).toBe(4);
  });
});

describe("dwell formatting", () => {
  it("renders hours and minutes the way the client asked", () => {
    expect(formatDwell(3.75)).toBe("3h 45m");
    expect(formatDwell(2)).toBe("2h");
  });

  it("shows a dash while the truck has not left", () => {
    expect(formatDwell(null)).toBe("—");
  });
});

describe("pairing events", () => {
  it("attaches dwell to the arrival, not the departure", () => {
    const rows = withDwell([
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d1", "v1", "DEPARTURE", "2026-09-01T10:00:00Z"),
    ]);
    expect(rows.find((r) => r.id === "a1")!.dwellHours).toBe(4);
    expect(rows.find((r) => r.id === "d1")!.dwellHours).toBeNull();
  });

  it("keeps each vehicle's events separate", () => {
    const rows = withDwell([
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("a2", "v2", "ARRIVAL", "2026-09-01T07:00:00Z"),
      ev("d2", "v2", "DEPARTURE", "2026-09-01T08:00:00Z"),
      ev("d1", "v1", "DEPARTURE", "2026-09-01T12:00:00Z"),
    ]);
    expect(rows.find((r) => r.id === "a1")!.dwellHours).toBe(6);
    expect(rows.find((r) => r.id === "a2")!.dwellHours).toBe(1);
  });

  it("leaves an unmatched arrival open rather than guessing", () => {
    const rows = withDwell([ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z")]);
    expect(rows[0].dwellHours).toBeNull();
  });

  it("supersedes an arrival that was never closed out", () => {
    // The truck clearly left without being logged out. Pairing the first
    // arrival with the later departure would report days of dwell.
    const rows = withDwell([
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("a2", "v1", "ARRIVAL", "2026-09-03T06:00:00Z"),
      ev("d1", "v1", "DEPARTURE", "2026-09-03T09:00:00Z"),
    ]);
    expect(rows.find((r) => r.id === "a1")!.dwellHours).toBeNull();
    expect(rows.find((r) => r.id === "a2")!.dwellHours).toBe(3);
  });

  it("handles events arriving out of order", () => {
    const rows = withDwell([
      ev("d1", "v1", "DEPARTURE", "2026-09-01T10:00:00Z"),
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
    ]);
    expect(rows.find((r) => r.id === "a1")!.dwellHours).toBe(4);
  });

  it("preserves the input order of the rows it returns", () => {
    const rows = withDwell([
      ev("d1", "v1", "DEPARTURE", "2026-09-01T10:00:00Z"),
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["d1", "a1"]);
  });
});
