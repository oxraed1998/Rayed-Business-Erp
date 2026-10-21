import { describe, expect, it } from "vitest";
import { allocateProportionally, D, money, sum } from "@/lib/money";

describe("money", () => {
  it("avoids floating point errors", () => {
    expect(sum([0.1, 0.2]).toFixed(2)).toBe("0.30");
    expect(D("0.1").plus("0.2").equals("0.3")).toBe(true);
    expect(money("1.005").toFixed(2)).toBe("1.01");
  });
  it("allocates proportionally with exact totals", () => {
    const parts = allocateProportionally(100, [1, 1, 1]);
    expect(parts.map((p) => p.toFixed(2))).toEqual(["33.34", "33.33", "33.33"]);
    expect(sum(parts).toFixed(2)).toBe("100.00");
  });
  it("splits equally when all weights are zero", () => {
    expect(allocateProportionally(10, [0, 0]).map((p) => p.toFixed(2))).toEqual(["5.00", "5.00"]);
  });
  it("handles negative totals", () => {
    const parts = allocateProportionally(-100, [1, 2]);
    expect(sum(parts).toFixed(2)).toBe("-100.00");
    expect(parts.map((p) => p.toFixed(2))).toEqual(["-33.33", "-66.67"]);
  });
});
