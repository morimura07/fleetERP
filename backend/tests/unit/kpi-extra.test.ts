import { describe, it, expect } from "vitest";
import { otifPct, avgInvoiceProcessingDays, vehicleTco, avgTcoPerVehicle, tcoCoverage } from "@backend/services/dashboard-kpi";

const at = (iso: string) => new Date(iso);

describe("OTIF — on time and in full", () => {
  const eta = at("2026-09-10T12:00:00Z");

  it("counts an order only when it is both on time and undamaged", () => {
    expect(otifPct([{ eta, actualDelivery: at("2026-09-09T08:00:00Z"), hasDamage: false }])).toBe(100);
  });

  it("fails an on-time delivery that arrived damaged", () => {
    // This is the whole point of OTIF over OTD: on time is not enough.
    expect(otifPct([{ eta, actualDelivery: at("2026-09-09T08:00:00Z"), hasDamage: true }])).toBe(0);
  });

  it("fails a late delivery even when nothing was damaged", () => {
    expect(otifPct([{ eta, actualDelivery: at("2026-09-12T08:00:00Z"), hasDamage: false }])).toBe(0);
  });

  it("is never higher than plain on-time delivery over the same orders", () => {
    const orders = [
      { eta, actualDelivery: at("2026-09-09T08:00:00Z"), hasDamage: false }, // on time, clean
      { eta, actualDelivery: at("2026-09-09T08:00:00Z"), hasDamage: true },  // on time, damaged
      { eta, actualDelivery: at("2026-09-14T08:00:00Z"), hasDamage: false }, // late, clean
      { eta, actualDelivery: at("2026-09-08T08:00:00Z"), hasDamage: false }, // on time, clean
    ];
    expect(otifPct(orders)).toBe(50); // 2 of 4, vs 75% on-time
  });

  it("treats arrival exactly at the ETA as on time", () => {
    expect(otifPct([{ eta, actualDelivery: eta, hasDamage: false }])).toBe(100);
  });

  it("ignores orders with no committed ETA, since there is nothing to measure", () => {
    expect(otifPct([{ eta: null, actualDelivery: at("2026-09-09T08:00:00Z"), hasDamage: false }])).toBe(0);
    expect(otifPct([])).toBe(0);
  });
});

describe("invoice processing time", () => {
  it("averages the days between delivery and the posted invoice", () => {
    const days = avgInvoiceProcessingDays([
      { deliveredAt: at("2026-09-01T00:00:00Z"), invoicedAt: at("2026-09-03T00:00:00Z") }, // 2
      { deliveredAt: at("2026-09-01T00:00:00Z"), invoicedAt: at("2026-09-05T00:00:00Z") }, // 4
    ]);
    expect(days).toBe("3.0");
  });

  it("skips orders that have not been invoiced yet", () => {
    const days = avgInvoiceProcessingDays([
      { deliveredAt: at("2026-09-01T00:00:00Z"), invoicedAt: at("2026-09-06T00:00:00Z") }, // 5
      { deliveredAt: at("2026-09-01T00:00:00Z"), invoicedAt: null },
    ]);
    expect(days).toBe("5.0"); // averaged over the one measurable order, not two
  });

  it("floors a back-dated invoice at zero rather than crediting negative days", () => {
    const days = avgInvoiceProcessingDays([
      { deliveredAt: at("2026-09-10T00:00:00Z"), invoicedAt: at("2026-09-08T00:00:00Z") },
    ]);
    expect(days).toBe("0.0");
  });

  it("returns 0.0 when nothing is measurable", () => {
    expect(avgInvoiceProcessingDays([])).toBe("0.0");
    expect(avgInvoiceProcessingDays([{ deliveredAt: null, invoicedAt: null }])).toBe("0.0");
  });
});

describe("total cost of ownership", () => {
  it("sums maintenance, fuel, tolls and other running costs", () => {
    const tco = vehicleTco({ maintenance: "1200.50", fuel: "3400.25", tolls: "150", other: "99.25" });
    expect(tco.toFixed(2)).toBe("4850.00");
  });

  it("stays exact rather than drifting through floating point", () => {
    const tco = vehicleTco({ maintenance: "0.10", fuel: "0.20", tolls: "0", other: "0" });
    expect(tco.toFixed(2)).toBe("0.30");
  });

  it("is zero for a truck that has cost nothing yet", () => {
    expect(vehicleTco({ maintenance: 0, fuel: 0, tolls: 0, other: 0 }).toFixed(2)).toBe("0.00");
  });

  it("averages across the fleet", () => {
    expect(avgTcoPerVehicle("12000", 4)).toBe("3000.00");
  });

  it("does not divide by an empty fleet", () => {
    expect(avgTcoPerVehicle("12000", 0)).toBe("0.00");
  });

  it("includes depreciation from the linked asset register entry", () => {
    const operating = vehicleTco({ maintenance: "1000", fuel: "0", tolls: "500", other: "0" });
    const owned = vehicleTco({ maintenance: "1000", fuel: "0", tolls: "500", other: "0", depreciation: "2500" });
    expect(operating.toFixed(2)).toBe("1500.00");
    expect(owned.toFixed(2)).toBe("4000.00"); // ownership costs more than running
  });

  it("treats a truck with no asset row as zero depreciation, not an error", () => {
    expect(vehicleTco({ maintenance: "100", fuel: 0, tolls: 0, other: 0 }).toFixed(2)).toBe("100.00");
  });
});

describe("TCO coverage", () => {
  it("reports what share of the fleet has a linked asset row", () => {
    // TCO understates cost for every unlinked truck, so the figure is published
    // alongside it rather than hidden.
    expect(tcoCoverage(3, 4)).toBe(75);
    expect(tcoCoverage(4, 4)).toBe(100);
  });

  it("is 0 when nothing is linked, and safe with no fleet at all", () => {
    expect(tcoCoverage(0, 10)).toBe(0);
    expect(tcoCoverage(0, 0)).toBe(0);
  });
});
