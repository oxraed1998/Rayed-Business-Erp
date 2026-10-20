import { describe, expect, it } from "vitest";
import { addCost, issue, receive } from "@/lib/domain/inventory";
import { D } from "@/lib/money";

describe("weighted average inventory", () => {
  it("receives and issues at average cost", () => {
    let s = { quantity: D(0), value: D(0) };
    s = receive(s, 10, 100);
    s = receive(s, 20, 260);
    const r = issue(s, 15);
    expect(r.cost.toFixed(2)).toBe("180.00");
    expect(r.state.quantity.toString()).toBe("15");
    expect(r.state.value.toFixed(2)).toBe("180.00");
  });
  it("issuing everything leaves zero value", () => {
    const s = receive({ quantity: D(0), value: D(0) }, 3, 10);
    const r = issue(s, 3);
    expect(r.cost.toFixed(2)).toBe("10.00");
    expect(r.state.value.toFixed(2)).toBe("0.00");
  });
  it("prevents negative stock", () => {
    expect(() => issue({ quantity: D(1), value: D(5) }, 2)).toThrow();
  });
  it("capitalises landed cost", () => {
    expect(addCost({ quantity: D(5), value: D(50) }, 7.5).value.toFixed(2)).toBe("57.50");
  });
});
