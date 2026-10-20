import { describe, expect, it } from "vitest";
import { capitalOwnership, distribute, partnerBalance } from "@/lib/domain/partners";

describe("partner distribution", () => {
  const shares = [
    { partnerId: "A", capitalAmount: 35000 },
    { partnerId: "B", capitalAmount: 25000 },
  ];
  it("follows capital ratio by default (35k/25k, profit 12k)", () => {
    const r = distribute(shares, 12000);
    expect(r.map((x) => x.amount.toFixed(2))).toEqual(["7000.00", "5000.00"]);
    expect(capitalOwnership(shares).map((x) => x.pct.toFixed(2))).toEqual(["58.33", "41.67"]);
  });
  it("uses agreed profit ratio that differs from capital", () => {
    const r = distribute([{ ...shares[0], profitSharePct: 50 }, { ...shares[1], profitSharePct: 50 }], 12000);
    expect(r.map((x) => x.amount.toFixed(2))).toEqual(["6000.00", "6000.00"]);
  });
  it("uses loss ratio for losses", () => {
    const r = distribute([
      { ...shares[0], profitSharePct: 50, lossSharePct: 70 },
      { ...shares[1], profitSharePct: 50, lossSharePct: 30 },
    ], -1000);
    expect(r.map((x) => x.amount.toFixed(2))).toEqual(["-700.00", "-300.00"]);
  });
  it("rejects ratios not summing to 100 or mixed", () => {
    expect(() => distribute([{ ...shares[0], profitSharePct: 60 }, { ...shares[1], profitSharePct: 30 }], 10)).toThrow(/100/);
    expect(() => distribute([{ ...shares[0], profitSharePct: 60 }, shares[1]], 10)).toThrow();
  });
  it("rounds to exact cents", () => {
    const r = distribute([{ partnerId: "a", capitalAmount: 1 }, { partnerId: "b", capitalAmount: 1 }, { partnerId: "c", capitalAmount: 1 }], 100);
    expect(r.reduce((a, x) => a.plus(x.amount), r[0].amount.minus(r[0].amount)).toFixed(2)).toBe("100.00");
  });
  it("balance", () => {
    const b = partnerBalance([
      { type: "CONTRIBUTION", amount: 35000 },
      { type: "PROFIT_DISTRIBUTION", amount: 7000 },
      { type: "WITHDRAWAL", amount: 2000 },
    ]);
    expect(b.net.toFixed(2)).toBe("40000.00");
  });
});
