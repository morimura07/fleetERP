import { describe, it, expect } from "vitest";
import { evaluateMatch } from "@backend/services/procurement";

const line = (qty: number, recv: number, price: number, desc = "item") => ({
  description: desc, quantity: qty, qtyReceived: recv, unitPrice: price,
});

describe("procurement 3-way match", () => {
  it("MATCHED when fully received and invoice equals PO total", () => {
    const r = evaluateMatch([line(10, 10, 5)], 50); // 10×5 = 50
    expect(r.status).toBe("MATCHED");
    expect(r.poTotal).toBe("50.00");
    expect(r.variances).toHaveLength(0);
  });

  it("VARIANCE when a line is under-received", () => {
    const r = evaluateMatch([line(10, 7, 5)], 50);
    expect(r.status).toBe("VARIANCE");
    expect(r.variances[0]).toMatchObject({ reason: "under-received", orderedQty: "10.000", receivedQty: "7.000" });
  });

  it("VARIANCE when a line is over-received", () => {
    const r = evaluateMatch([line(10, 12, 5)], 50);
    expect(r.status).toBe("VARIANCE");
    expect(r.variances[0].reason).toBe("over-received");
  });

  it("MATCHED within the 1% price tolerance", () => {
    // PO total 100; invoice 100.5 ⇒ 0.5% diff, within 1%
    const r = evaluateMatch([line(20, 20, 5)], 100.5);
    expect(r.status).toBe("MATCHED");
  });

  it("VARIANCE when the invoice total exceeds tolerance", () => {
    // PO total 100; invoice 105 ⇒ 5% diff, over 1%
    const r = evaluateMatch([line(20, 20, 5)], 105);
    expect(r.status).toBe("VARIANCE");
    expect(r.variances.some((v) => v.description === "(total)")).toBe(true);
  });

  it("sums multiple lines into the PO total", () => {
    const r = evaluateMatch([line(10, 10, 5), line(4, 4, 2.5)], 60); // 50 + 10 = 60
    expect(r.poTotal).toBe("60.00");
    expect(r.status).toBe("MATCHED");
  });
});
