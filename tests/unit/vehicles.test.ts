import { describe, expect, it } from "vitest";
import { vehicleCost } from "@/lib/domain/vehicle-cost";
import { allocateLandedCost } from "@/lib/domain/allocation";

describe("vehicle landed cost", () => {
  it("converts currency and excludes recoverable VAT", () => {
    const r = vehicleCost({
      purchasePrice: "20000",
      exchangeRate: "3.75",
      expenses: [
        { category: "SHIPPING", amount: "4500" },
        { category: "CUSTOMS_DUTY", amount: "3750", vatAmount: "0" },
        { category: "CLEARANCE", amount: "1000", vatAmount: "150", vatRecoverable: true },
        { category: "REPAIR", amount: "800", vatAmount: "120", vatRecoverable: false },
      ],
      sellingPrice: "95000",
    });
    expect(r.purchaseBase.toFixed(2)).toBe("75000.00");
    expect(r.expensesTotal.toFixed(2)).toBe("10170.00");
    expect(r.recoverableVat.toFixed(2)).toBe("150.00");
    expect(r.landedCost.toFixed(2)).toBe("85170.00");
    expect(r.profit!.toFixed(2)).toBe("9830.00");
  });
  it("has no profit until a price is set", () => {
    expect(vehicleCost({ purchasePrice: 1, exchangeRate: 1, expenses: [] }).profit).toBeNull();
  });
});

describe("landed cost allocation", () => {
  const items = [
    { id: "a", quantity: 1, value: 30000, weight: 1500, volume: 10 },
    { id: "b", quantity: 1, value: 10000, weight: 1000, volume: 10 },
    { id: "c", quantity: 2, value: 20000, weight: 2500, volume: 20 },
  ];
  it("by value", () => {
    const m = allocateLandedCost(6000, items, "VALUE");
    expect([m.get("a")!, m.get("b")!, m.get("c")!].map((d) => d.toFixed(2))).toEqual(["3000.00", "1000.00", "2000.00"]);
  });
  it("by quantity", () => {
    const m = allocateLandedCost(1000, items, "QUANTITY");
    expect(m.get("c")!.toFixed(2)).toBe("500.00");
  });
  it("by weight keeps exact total", () => {
    const m = allocateLandedCost("1000.01", items, "WEIGHT");
    const total = [...m.values()].reduce((a, b) => a.plus(b));
    expect(total.toFixed(2)).toBe("1000.01");
  });
  it("by volume", () => {
    expect(allocateLandedCost(400, items, "VOLUME").get("c")!.toFixed(2)).toBe("200.00");
  });
  it("rejects missing weights", () => {
    expect(() => allocateLandedCost(10, [{ id: "x" }], "WEIGHT")).toThrow();
  });
});
