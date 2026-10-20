import { describe, expect, it } from "vitest";
import { calcInvoice, paymentStatus } from "@/lib/domain/invoice-calc";

describe("invoice calculations", () => {
  it("computes per-line VAT with discount", () => {
    const r = calcInvoice([
      { description: "سيارة", quantity: 1, unitPrice: "80000", discount: "1000", vatRate: 15 },
      { description: "رسوم", quantity: 3, unitPrice: "33.33", vatRate: 15 },
    ]);
    expect(r.subtotal.toFixed(2)).toBe("80099.99");
    expect(r.discountTotal.toFixed(2)).toBe("1000.00");
    expect(r.vatTotal.toFixed(2)).toBe("11865.00");
    expect(r.total.toFixed(2)).toBe("90964.99");
  });
  it("zero-rated lines", () => {
    expect(calcInvoice([{ description: "x", quantity: 2, unitPrice: 50, vatRate: 0 }]).total.toFixed(2)).toBe("100.00");
  });
  it("rejects invalid lines", () => {
    expect(() => calcInvoice([])).toThrow();
    expect(() => calcInvoice([{ description: "x", quantity: 1, unitPrice: 10, discount: 11 }])).toThrow();
    expect(() => calcInvoice([{ description: "x", quantity: 0, unitPrice: 10 }])).toThrow();
  });
  it("payment status", () => {
    const today = new Date("2026-10-20");
    expect(paymentStatus(100, 100, null, today)).toBe("PAID");
    expect(paymentStatus(100, 40, new Date("2026-11-01"), today)).toBe("PARTIAL");
    expect(paymentStatus(100, 40, new Date("2026-10-01"), today)).toBe("OVERDUE");
    expect(paymentStatus(100, 0, null, today)).toBe("UNPAID");
  });
});
