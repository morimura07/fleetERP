import { describe, it, expect } from "vitest";
import { summarizeDock, summarizeIncidents, shiftWindows } from "@backend/services/operational-kpi";

const at = (iso: string) => new Date(iso);
const ev = (id: string, vehicleId: string, kind: "ARRIVAL" | "DEPARTURE", iso: string) =>
  ({ id, vehicleId, kind, eventAt: at(iso) });

const incident = (
  currency: string,
  cargoValue: number,
  damageValue: number,
  settlementAmount = 0,
  claimStatus: "NOT_FILED" | "LODGED" | "RECOVERED" = "NOT_FILED",
  reportedAt = "2026-06-01T00:00:00Z",
) => ({ currency, cargoValue, damageValue, settlementAmount, claimStatus, reportedAt: at(reportedAt) } as const);

describe("dock KPI ribbon", () => {
  it("averages dwell across closed visits only", () => {
    const s = summarizeDock([
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d1", "v1", "DEPARTURE", "2026-09-01T08:00:00Z"), // 2h
      ev("a2", "v2", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d2", "v2", "DEPARTURE", "2026-09-01T10:00:00Z"), // 4h
    ]);
    expect(s.avgDwellHours).toBe(3);
    expect(s.closedVisits).toBe(2);
  });

  it("counts a truck with no departure as still on site, not as a visit", () => {
    const s = summarizeDock([
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d1", "v1", "DEPARTURE", "2026-09-01T08:00:00Z"),
      ev("a2", "v2", "ARRIVAL", "2026-09-01T07:00:00Z"),
    ]);
    expect(s.activeAtDocks).toBe(1);
    expect(s.closedVisits).toBe(1);
    expect(s.avgDwellHours).toBe(2); // the open visit must not drag the mean down
  });

  it("flags only visits past the free period", () => {
    const s = summarizeDock([
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d1", "v1", "DEPARTURE", "2026-09-01T09:00:00Z"), // 3h, inside
      ev("a2", "v2", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d2", "v2", "DEPARTURE", "2026-09-01T12:00:00Z"), // 6h, over
    ]);
    expect(s.detentionAlerts).toBe(1);
  });

  it("makes on-time the exact complement of the detention alerts", () => {
    const s = summarizeDock([
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d1", "v1", "DEPARTURE", "2026-09-01T09:00:00Z"),
      ev("a2", "v2", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d2", "v2", "DEPARTURE", "2026-09-01T12:00:00Z"),
      ev("a3", "v3", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d3", "v3", "DEPARTURE", "2026-09-01T07:00:00Z"),
    ]);
    expect(s.closedVisits).toBe(3);
    expect(s.detentionAlerts).toBe(1);
    expect(s.onTimeGatePassesPct).toBe(66.7);
  });

  it("honours a different free period", () => {
    const events = [
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d1", "v1", "DEPARTURE", "2026-09-01T09:00:00Z"), // 3h
    ];
    expect(summarizeDock(events, 4).detentionAlerts).toBe(0);
    expect(summarizeDock(events, 2).detentionAlerts).toBe(1);
  });

  it("reports nulls rather than zero when nothing has closed", () => {
    const s = summarizeDock([ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z")]);
    expect(s.avgDwellHours).toBeNull();
    expect(s.onTimeGatePassesPct).toBeNull();
    expect(s.activeAtDocks).toBe(1);
  });

  it("is empty for no events at all", () => {
    expect(summarizeDock([])).toEqual({
      avgDwellHours: null,
      activeAtDocks: 0,
      detentionAlerts: 0,
      onTimeGatePassesPct: null,
      closedVisits: 0,
    });
  });

  it("does not pair one vehicle's arrival with another's departure", () => {
    const s = summarizeDock([
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d2", "v2", "DEPARTURE", "2026-09-01T08:00:00Z"),
    ]);
    expect(s.closedVisits).toBe(0);
    expect(s.activeAtDocks).toBe(1);
  });

  it("counts a truck that visited twice as one truck on site", () => {
    const s = summarizeDock([
      ev("a1", "v1", "ARRIVAL", "2026-09-01T06:00:00Z"),
      ev("d1", "v1", "DEPARTURE", "2026-09-01T08:00:00Z"),
      ev("a2", "v1", "ARRIVAL", "2026-09-02T06:00:00Z"),
    ]);
    expect(s.activeAtDocks).toBe(1);
    expect(s.closedVisits).toBe(1);
  });
});

describe("incident KPI ribbon", () => {
  it("states the damage rate as loss over cargo value", () => {
    const s = summarizeIncidents([incident("USD", 10000, 1000), incident("USD", 10000, 3000)]);
    expect(s.damageRatePct).toBe(20); // 4000 / 20000
    expect(s.totalIncurredLoss.toNumber()).toBe(4000);
  });

  it("states recovery as settlement over loss", () => {
    const s = summarizeIncidents([
      incident("USD", 10000, 2000, 1000, "RECOVERED"),
      incident("USD", 10000, 2000, 500, "RECOVERED"),
    ]);
    expect(s.recoveryRatePct).toBe(37.5); // 1500 / 4000
  });

  it("counts only filed claims in claimed YTD", () => {
    const s = summarizeIncidents(
      [
        incident("USD", 10000, 1000, 0, "NOT_FILED", "2026-03-01T00:00:00Z"),
        incident("USD", 10000, 2500, 0, "LODGED", "2026-03-01T00:00:00Z"),
      ],
      at("2026-09-12T00:00:00Z"),
    );
    expect(s.totalClaimedYtd.toNumber()).toBe(2500);
    expect(s.totalIncurredLoss.toNumber()).toBe(3500); // incurred counts both
  });

  it("excludes a filed claim from a previous year", () => {
    const s = summarizeIncidents(
      [
        incident("USD", 10000, 4000, 0, "LODGED", "2025-11-01T00:00:00Z"),
        incident("USD", 10000, 1000, 0, "LODGED", "2026-02-01T00:00:00Z"),
      ],
      at("2026-09-12T00:00:00Z"),
    );
    expect(s.totalClaimedYtd.toNumber()).toBe(1000);
  });

  it("reports on one currency and says what it left out", () => {
    // Adding shillings to dollars would produce a confident and wrong total.
    const s = summarizeIncidents([
      incident("USD", 50000, 5000),
      incident("TZS", 900, 400),
      incident("TZS", 800, 100),
    ]);
    expect(s.currency).toBe("USD");
    expect(s.totalIncurredLoss.toNumber()).toBe(5000);
    expect(s.reports).toBe(1);
    expect(s.excludedOtherCurrency).toBe(2);
  });

  it("picks the currency carrying the most cargo, not the most rows", () => {
    const s = summarizeIncidents([
      incident("TZS", 100, 10),
      incident("TZS", 100, 10),
      incident("TZS", 100, 10),
      incident("USD", 80000, 4000),
    ]);
    expect(s.currency).toBe("USD");
    expect(s.excludedOtherCurrency).toBe(3);
  });

  it("is empty, not NaN, when there are no reports", () => {
    const s = summarizeIncidents([]);
    expect(s.currency).toBeNull();
    expect(s.damageRatePct).toBe(0);
    expect(s.recoveryRatePct).toBe(0);
    expect(s.totalIncurredLoss.toNumber()).toBe(0);
    expect(s.reports).toBe(0);
  });

  it("survives a report filed before its cargo was valued", () => {
    const s = summarizeIncidents([incident("USD", 0, 500, 0, "LODGED")]);
    expect(s.damageRatePct).toBe(0);
    expect(s.recoveryRatePct).toBe(0);
  });
});

describe("shift windows", () => {
  it("covers 06:00 to 18:00 local for a day shift", () => {
    // Local 06:00 to 17:00 on 1 Sept, so the range sits inside one local day.
    const w = shiftWindows(at("2026-09-01T03:00:00Z"), at("2026-09-01T14:00:00Z"), "DAY");
    expect(w).toHaveLength(1);
    // 06:00 EAT is 03:00 UTC; 18:00 EAT is 15:00 UTC.
    expect(w[0].gte.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(w[0].lt.toISOString()).toBe("2026-09-01T15:00:00.000Z");
  });

  it("splits a night shift either side of local midnight", () => {
    const w = shiftWindows(at("2026-09-01T06:00:00Z"), at("2026-09-01T06:00:00Z"), "NIGHT");
    expect(w).toHaveLength(2);
    expect(w[0].gte.toISOString()).toBe("2026-08-31T21:00:00.000Z"); // local 00:00
    expect(w[0].lt.toISOString()).toBe("2026-09-01T03:00:00.000Z"); // local 06:00
    expect(w[1].gte.toISOString()).toBe("2026-09-01T15:00:00.000Z"); // local 18:00
    expect(w[1].lt.toISOString()).toBe("2026-09-01T21:00:00.000Z"); // next local 00:00
  });

  it("produces one window per day across a range", () => {
    const w = shiftWindows(at("2026-09-01T03:00:00Z"), at("2026-09-03T14:00:00Z"), "DAY");
    expect(w).toHaveLength(3);
  });

  it("returns nothing when the range runs backwards", () => {
    expect(shiftWindows(at("2026-09-05T00:00:00Z"), at("2026-09-01T00:00:00Z"), "DAY")).toEqual([]);
  });

  it("refuses a range too long to express as windows", () => {
    expect(() => shiftWindows(at("2026-01-01T00:00:00Z"), at("2026-12-31T00:00:00Z"), "DAY")).toThrow(
      /at most 92 days/,
    );
  });

  it("day and night windows do not overlap", () => {
    const day = shiftWindows(at("2026-09-01T03:00:00Z"), at("2026-09-01T14:00:00Z"), "DAY");
    const night = shiftWindows(at("2026-09-01T03:00:00Z"), at("2026-09-01T14:00:00Z"), "NIGHT");
    for (const d of day) {
      for (const n of night) {
        expect(d.gte < n.lt && n.gte < d.lt).toBe(false);
      }
    }
  });
});

describe("shift windows, local day boundaries", () => {
  it("treats a UTC range as the local days it actually covers", () => {
    // 23:00Z on 1 Sept is 02:00 local on 2 Sept, so this spans two local days
    // even though it reads as one UTC day. Getting this wrong would silently
    // drop the last six hours of every night shift.
    const w = shiftWindows(at("2026-09-01T00:00:00Z"), at("2026-09-01T23:00:00Z"), "DAY");
    expect(w).toHaveLength(2);
  });
});
