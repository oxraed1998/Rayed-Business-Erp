import { describe, expect, it } from "vitest";
import { can, canAssignRole, effectivePermissions } from "@/lib/permissions";

describe("permissions", () => {
  it("owner has everything", () => {
    expect(can({ role: "TENANT_OWNER", grants: [], denials: [] }, "accounting.close")).toBe(true);
  });
  it("employees cannot read financials or accounting", () => {
    const m = { role: "EMPLOYEE" as const, grants: [], denials: [] };
    expect(can(m, "financials.read")).toBe(false);
    expect(can(m, "accounting.read")).toBe(false);
    expect(can(m, "vehicles.create")).toBe(true);
    expect(can(m, "vehicles.delete")).toBe(false);
  });
  it("grants and denials adjust role defaults", () => {
    const m = { role: "EMPLOYEE" as const, grants: ["reports.read", "bogus.perm"], denials: ["vehicles.create"] };
    const p = effectivePermissions(m);
    expect(p.has("reports.read")).toBe(true);
    expect(p.has("vehicles.create")).toBe(false);
    expect([...p].includes("bogus.perm" as never)).toBe(false);
  });
  it("owners cannot be denied", () => {
    expect(can({ role: "TENANT_OWNER", grants: [], denials: ["users.manage"] }, "users.manage")).toBe(true);
  });
  it("viewer is read-only", () => {
    const p = effectivePermissions({ role: "VIEWER", grants: [], denials: [] });
    expect([...p].every((x) => x.endsWith(".read"))).toBe(true);
  });
  it("roles cannot be escalated", () => {
    expect(canAssignRole("COMPANY_ADMIN", "TENANT_OWNER")).toBe(false);
    expect(canAssignRole("COMPANY_ADMIN", "COMPANY_ADMIN")).toBe(false);
    expect(canAssignRole("COMPANY_ADMIN", "ACCOUNTANT")).toBe(true);
    expect(canAssignRole("TENANT_OWNER", "TENANT_OWNER")).toBe(true);
  });
});
