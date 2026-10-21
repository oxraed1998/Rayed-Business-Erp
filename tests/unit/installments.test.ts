import { describe, expect, it } from "vitest";
import { addMonths, allocateToInstallments, buildSchedule, installmentStatus } from "@/lib/domain/installments";

describe("installments", () => {
  it("builds schedule with rounding in last installment", () => {
    const s = buildSchedule(1000, 100, 7, new Date("2026-01-31"));
    expect(s).toHaveLength(7);
    expect(s[0].amount.toFixed(2)).toBe("128.57");
    expect(s[6].amount.toFixed(2)).toBe("128.58");
    expect(s.reduce((a, x) => a.plus(x.amount), s[0].amount.minus(s[0].amount)).toFixed(2)).toBe("900.00");
    expect(s[1].dueDate.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
  it("validates inputs", () => {
    expect(() => buildSchedule(100, 100, 2, new Date())).toThrow();
    expect(() => buildSchedule(100, 0, 0, new Date())).toThrow();
  });
  it("allocates payments oldest first", () => {
    const r = allocateToInstallments([
      { id: "1", amount: 100, paidAmount: 100 },
      { id: "2", amount: 100, paidAmount: 30 },
      { id: "3", amount: 100, paidAmount: 0 },
    ], 120);
    expect(r.applied.map((a) => [a.id, a.amount.toFixed(2)])).toEqual([["2", "70.00"], ["3", "50.00"]]);
    expect(r.excess.toFixed(2)).toBe("0.00");
  });
  it("detects overdue", () => {
    const today = new Date("2026-10-20");
    expect(installmentStatus({ amount: 10, paidAmount: 0, dueDate: new Date("2026-10-19") }, today)).toBe("OVERDUE");
    expect(installmentStatus({ amount: 10, paidAmount: 10, dueDate: new Date("2026-10-19") }, today)).toBe("PAID");
    expect(addMonths(new Date("2026-03-31"), -1).toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});
