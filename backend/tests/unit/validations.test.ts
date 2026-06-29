import { describe, it, expect } from "vitest";
import { dispatchSchema, dailyReportSchema, vehicleSchema, paginationSchema } from "@backend/lib/validations";

describe("dispatchSchema", () => {
  const base = { jobId: "c".repeat(25), driverId: "c".repeat(25), vehicleId: "c".repeat(25) };

  it("rejects end before start", () => {
    const r = dispatchSchema.safeParse({ ...base, scheduledStart: "2026-06-01T12:00", scheduledEnd: "2026-06-01T10:00" });
    expect(r.success).toBe(false);
  });

  it("accepts valid window", () => {
    const r = dispatchSchema.safeParse({ ...base, scheduledStart: "2026-06-01T10:00", scheduledEnd: "2026-06-01T12:00" });
    expect(r.success).toBe(true);
  });
});

describe("dailyReportSchema", () => {
  it("requires workEnd after workStart", () => {
    const r = dailyReportSchema.safeParse({ jobId: "c".repeat(25), workStart: "2026-06-01T18:00", workEnd: "2026-06-01T09:00", mileage: 10 });
    expect(r.success).toBe(false);
  });
});

describe("vehicleSchema", () => {
  it("coerces date strings", () => {
    const r = vehicleSchema.safeParse({
      vehicleNumber: "V-1", plateNumber: "品川 500 あ 12-34", maker: "Honda", model: "N-VAN",
      insuranceExpiry: "2027-01-01", inspectionExpiry: "2027-06-01",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.insuranceExpiry).toBeInstanceOf(Date);
  });
});

describe("paginationSchema", () => {
  it("applies defaults and clamps pageSize", () => {
    expect(paginationSchema.parse({}).page).toBe(1);
    expect(paginationSchema.safeParse({ pageSize: "999" }).success).toBe(false);
  });
});
