import { describe, expect, it } from "vitest";
import { formToObject } from "@/server/action";

describe("formToObject", () => {
  it("builds nested objects and arrays, dropping empty rows", () => {
    const fd = new FormData();
    fd.set("name", " ثوب ");
    fd.set("settlement.accountId", "AP");
    fd.set("settlement.supplierId", "");
    fd.set("lines.0.description", "a");
    fd.set("lines.0.quantity", "2");
    fd.set("lines.1.description", "");
    fd.set("lines.1.quantity", "");
    fd.set("lines.2.description", "c");
    const o = formToObject(fd);
    expect(o.name).toBe(" ثوب ");
    expect(o.settlement).toEqual({ accountId: "AP", supplierId: undefined });
    expect(o.lines).toEqual([{ description: "a", quantity: "2" }, { description: "c" }]);
  });
  it("collects repeated keys into arrays and ignores Next internals", () => {
    const fd = new FormData();
    fd.append("grants", "reports.read");
    fd.append("grants", "audit.read");
    fd.set("$ACTION_ID_abc", "x");
    expect(formToObject(fd)).toEqual({ grants: ["reports.read", "audit.read"] });
  });
});
