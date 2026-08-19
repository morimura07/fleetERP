import { describe, it, expect } from "vitest";
import { tripBatchSchema } from "@backend/lib/validations";

const ID = "cmrrwaf720002iw035g668z0w"; // any valid cuid
const leg = (over: Record<string, unknown> = {}) => ({
  driverId: ID,
  vehicleId: ID,
  scheduledStart: "2026-09-01T06:00:00.000Z",
  scheduledEnd: "2026-09-03T18:00:00.000Z",
  ...over,
});

describe("multi-vehicle assignment payload", () => {
  it("accepts a convoy of many trucks against one order", () => {
    const parsed = tripBatchSchema.parse({
      orderId: ID,
      corridor: "NORTHERN",
      legs: Array.from({ length: 15 }, () => leg()),
    });
    expect(parsed.legs).toHaveLength(15);
    expect(parsed.orderId).toBe(ID);
  });

  it("accepts a single truck, so the batch path is not a special case", () => {
    expect(tripBatchSchema.parse({ orderId: ID, legs: [leg()] }).legs).toHaveLength(1);
  });

  it("requires at least one vehicle", () => {
    expect(() => tripBatchSchema.parse({ orderId: ID, legs: [] })).toThrow();
  });

  it("caps the batch so a runaway form cannot create thousands of trips", () => {
    expect(() => tripBatchSchema.parse({ orderId: ID, legs: Array.from({ length: 51 }, () => leg()) })).toThrow();
  });

  it("rejects a leg whose window ends before it starts", () => {
    expect(() =>
      tripBatchSchema.parse({
        orderId: ID,
        legs: [leg({ scheduledStart: "2026-09-05T06:00:00.000Z", scheduledEnd: "2026-09-01T06:00:00.000Z" })],
      }),
    ).toThrow();
  });

  it("defaults corridor and per-leg distance so a minimal row is valid", () => {
    const parsed = tripBatchSchema.parse({ orderId: ID, legs: [leg()] });
    expect(parsed.corridor).toBe("DOMESTIC");
    expect(parsed.legs[0].mileageKm).toBe("0");
  });

  it("keeps each leg's own window rather than sharing one", () => {
    const parsed = tripBatchSchema.parse({
      orderId: ID,
      legs: [
        leg({ scheduledStart: "2026-09-01T06:00:00.000Z", scheduledEnd: "2026-09-02T06:00:00.000Z" }),
        leg({ scheduledStart: "2026-09-04T06:00:00.000Z", scheduledEnd: "2026-09-06T06:00:00.000Z" }),
      ],
    });
    // Trucks on the same order leave on different days (client review).
    expect(parsed.legs[0].scheduledStart.toISOString()).not.toBe(parsed.legs[1].scheduledStart.toISOString());
  });
});

/**
 * The route refuses a batch that clashes with itself before touching the
 * database. This mirrors that rule so the intent is pinned independently of the
 * handler.
 */
function selfConflict(legs: { driverId: string; vehicleId: string; s: string; e: string }[]) {
  const overlaps = (a: { s: string; e: string }, b: { s: string; e: string }) =>
    new Date(a.s) < new Date(b.e) && new Date(b.s) < new Date(a.e);
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      if (!overlaps(legs[i], legs[j])) continue;
      if (legs[i].vehicleId === legs[j].vehicleId) return "vehicle";
      if (legs[i].driverId === legs[j].driverId) return "driver";
    }
  }
  return null;
}

describe("conflicts inside one batch", () => {
  const A = { s: "2026-09-01T06:00:00Z", e: "2026-09-03T18:00:00Z" };
  const B = { s: "2026-09-02T06:00:00Z", e: "2026-09-04T18:00:00Z" }; // overlaps A
  const C = { s: "2026-09-10T06:00:00Z", e: "2026-09-12T18:00:00Z" }; // clear of both

  it("catches the same truck picked twice in overlapping windows", () => {
    expect(selfConflict([
      { driverId: "d1", vehicleId: "v1", ...A },
      { driverId: "d2", vehicleId: "v1", ...B },
    ])).toBe("vehicle");
  });

  it("catches the same driver picked twice in overlapping windows", () => {
    expect(selfConflict([
      { driverId: "d1", vehicleId: "v1", ...A },
      { driverId: "d1", vehicleId: "v2", ...B },
    ])).toBe("driver");
  });

  it("allows the same truck again once the first run has finished", () => {
    expect(selfConflict([
      { driverId: "d1", vehicleId: "v1", ...A },
      { driverId: "d1", vehicleId: "v1", ...C },
    ])).toBeNull();
  });

  it("allows a full convoy of distinct trucks and drivers", () => {
    expect(selfConflict([
      { driverId: "d1", vehicleId: "v1", ...A },
      { driverId: "d2", vehicleId: "v2", ...A },
      { driverId: "d3", vehicleId: "v3", ...A },
    ])).toBeNull();
  });

  it("treats back-to-back windows as no clash", () => {
    expect(selfConflict([
      { driverId: "d1", vehicleId: "v1", s: "2026-09-01T06:00:00Z", e: "2026-09-02T06:00:00Z" },
      { driverId: "d1", vehicleId: "v1", s: "2026-09-02T06:00:00Z", e: "2026-09-03T06:00:00Z" },
    ])).toBeNull();
  });
});
