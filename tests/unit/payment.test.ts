import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the prisma client used by the payment service.
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { deliveryJob: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import { computeMonthlyPayments } from "@/lib/services/payment";

describe("computeMonthlyPayments", () => {
  beforeEach(() => findMany.mockReset());

  it("groups reward by driver and sums correctly", async () => {
    findMany.mockResolvedValue([
      { rewardAmount: 5000, dispatch: { driver: { id: "d1", name: "佐藤" } } },
      { rewardAmount: 3000, dispatch: { driver: { id: "d1", name: "佐藤" } } },
      { rewardAmount: 8000, dispatch: { driver: { id: "d2", name: "鈴木" } } },
    ]);

    const result = await computeMonthlyPayments(2026, 6);

    expect(result).toHaveLength(2);
    // sorted by totalAmount desc → 佐藤 (8000) first, 鈴木 (8000) — tie, both 8000
    const sato = result.find((r) => r.driverId === "d1")!;
    expect(sato.totalAmount).toBe(8000);
    expect(sato.jobCount).toBe(2);
    const suzuki = result.find((r) => r.driverId === "d2")!;
    expect(suzuki.totalAmount).toBe(8000);
    expect(suzuki.jobCount).toBe(1);
  });

  it("ignores jobs with no dispatched driver", async () => {
    findMany.mockResolvedValue([
      { rewardAmount: 5000, dispatch: null },
      { rewardAmount: 2000, dispatch: { driver: { id: "d1", name: "佐藤" } } },
    ]);
    const result = await computeMonthlyPayments(2026, 6);
    expect(result).toHaveLength(1);
    expect(result[0].totalAmount).toBe(2000);
  });

  it("returns empty array when no completed jobs", async () => {
    findMany.mockResolvedValue([]);
    expect(await computeMonthlyPayments(2026, 6)).toEqual([]);
  });
});
