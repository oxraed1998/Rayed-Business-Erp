import { describe, expect, it } from "vitest";
import { costOfRemoval, herdSummary } from "@/lib/domain/livestock";
import { D } from "@/lib/money";

describe("herd valuation", () => {
  it("tracks counts: 100 imported, 20 sold, 3 dead => 77", () => {
    const s = herdSummary(
      [
        { type: "PURCHASE", quantity: 100, amount: "80000", costRemoved: 0 },
        { type: "SALE", quantity: 20, amount: "24000", costRemoved: "17000" },
        { type: "DEATH", quantity: 3, amount: 0, costRemoved: "2550" },
      ],
      [{ amount: "5000" }, { amount: "1000", vatAmount: "150", vatRecoverable: false }],
    );
    expect(s.remaining).toBe(77);
    expect(s.careCost.toFixed(2)).toBe("6150.00");
    expect(s.valuation.toFixed(2)).toBe("66600.00");
    expect(s.realizedProfit.toFixed(2)).toBe("7000.00");
  });
  it("average cost removal and no double counting", () => {
    let events = [{ type: "PURCHASE" as const, quantity: 3, amount: "100", costRemoved: "0" }];
    let s = herdSummary(events, [{ amount: "0.01" }]);
    const c1 = costOfRemoval(s, 1);
    expect(c1.toFixed(2)).toBe("33.34");
    events = [...events, { type: "SALE" as const, quantity: 1, amount: "50", costRemoved: c1.toFixed(2) }];
    s = herdSummary(events, [{ amount: "0.01" }]);
    const c2 = costOfRemoval(s, 2);
    // Last animals carry the full residual so the herd value reaches exactly zero.
    expect(c1.plus(c2).toFixed(2)).toBe("100.01");
    expect(D(s.valuation).minus(c2).toFixed(2)).toBe("0.00");
  });
  it("rejects removing more than remaining", () => {
    expect(() => costOfRemoval({ remaining: 2, valuation: D(10) }, 3)).toThrow();
  });
});
