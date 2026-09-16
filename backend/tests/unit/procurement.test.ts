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
    expect(r.variances[0]).toMatchObject({ orderedQty: "10.000", receivedQty: "7.000" });
    expect(r.variances[0].reason).toMatch(/^under-received by 3/);
  });

  it("VARIANCE when a line is over-received", () => {
    const r = evaluateMatch([line(10, 12, 5)], 50);
    expect(r.status).toBe("VARIANCE");
    expect(r.variances[0].reason).toMatch(/^over-received by 2/);
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
    expect(r.variances.some((v) => v.description === "(invoice)")).toBe(true);
  });

  it("sums multiple lines into the PO total", () => {
    const r = evaluateMatch([line(10, 10, 5), line(4, 4, 2.5)], 60); // 50 + 10 = 60
    expect(r.poTotal).toBe("60.00");
    expect(r.status).toBe("MATCHED");
  });

  it("matches the invoice against what was accepted, not what was ordered, once inspected", () => {
    // 10 ordered, 11 received, 10 accepted after inspection; invoice for 10 x 5 = 50.
    const r = evaluateMatch([{ description: "item", quantity: 10, qtyReceived: 11, qtyAccepted: 10, unitPrice: 5 }], 50);
    expect(r.status).toBe("MATCHED");
    expect(r.acceptedTotal).toBe("50.00");
  });

  it("honours the policy's quantity tolerance", () => {
    // 3 short of 100 is 3%; within a 5% tolerance, outside a 2% one.
    expect(evaluateMatch([line(100, 97, 1)], 97, { price: 0.01, quantity: 0.05 }).status).toBe("MATCHED");
    expect(evaluateMatch([line(100, 97, 1)], 97, { price: 0.01, quantity: 0.02 }).status).toBe("VARIANCE");
  });

  it("names the gap and the tolerance on the invoice line", () => {
    const r = evaluateMatch([line(20, 20, 5)], 105, { price: 0.02, quantity: 0 });
    expect(r.variances[0].reason).toMatch(/gap 5.00 exceeds the 2.00% tolerance \(2.00\)/);
  });
});
