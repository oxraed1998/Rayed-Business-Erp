import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createAgreement, distributeProfit, recordPartnerMovement } from "@/server/services/partners";
import { rateLimit } from "@/lib/auth/rate-limit";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { createInvitation, acceptInvitation, planLimits } from "@/server/services/tenancy";
import { assertBalanced, balanceOf, makeTenant, tx } from "./helpers";

let T: Awaited<ReturnType<typeof makeTenant>>;
beforeAll(async () => { T = await makeTenant("part"); });
afterAll(() => db.$disconnect());

describe("partners", () => {
  it("35k/25k capital, 12k profit → 7k/5k posted to partner accounts", async () => {
    const a = await db.partner.create({ data: { tenantId: T.tenant.id, name: "الشريك أ" } });
    const b = await db.partner.create({ data: { tenantId: T.tenant.id, name: "الشريك ب" } });
    const ag = await tx((t) => createAgreement(t, T.actor, { name: "شراكة السيارات", scope: "ACTIVITY", scopeRefId: T.act("VEHICLES"), shares: [{ partnerId: a.id, capitalAmount: 35000 }, { partnerId: b.id, capitalAmount: 25000 }] }));
    await tx((t) => recordPartnerMovement(t, T.actor, { agreementId: ag.id, partnerId: a.id, type: "CONTRIBUTION", amount: 35000, date: new Date("2026-01-01"), accountId: T.acc("BANK") }));
    await tx((t) => recordPartnerMovement(t, T.actor, { agreementId: ag.id, partnerId: b.id, type: "CONTRIBUTION", amount: 25000, date: new Date("2026-01-01"), accountId: T.acc("BANK") }));
    const parts = await tx((t) => distributeProfit(t, T.actor, { agreementId: ag.id, amount: 12000, date: new Date("2026-12-31"), post: true }));
    expect(parts.map((p) => p.amount.toFixed(2))).toEqual(["7000.00", "5000.00"]);
    expect(await balanceOf(T.actor, T.acc("PARTNER_CURRENT"))).toBe("72000.00");
    const lines = await db.journalLine.groupBy({ by: ["partnerId"], where: { tenantId: T.tenant.id, partnerId: { not: null } }, _sum: { credit: true } });
    expect(lines.find((l) => l.partnerId === a.id)!._sum.credit!.toFixed(2)).toBe("42000.00");
    await assertBalanced(T.actor);
  });
  it("rejects partner from another tenant", async () => {
    const other = await makeTenant("other");
    const p = await db.partner.create({ data: { tenantId: other.tenant.id, name: "غريب" } });
    await expect(tx((t) => createAgreement(t, T.actor, { name: "x", scope: "COMPANY", shares: [{ partnerId: p.id, capitalAmount: 1 }] }))).rejects.toThrow(/الشريك/);
  });
});

describe("auth primitives", () => {
  it("hashes passwords with bcrypt", async () => {
    const h = await hashPassword("Secret12345");
    expect(h).not.toContain("Secret12345");
    expect(await verifyPassword("Secret12345", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(passwordProblem("short1")).not.toBeNull();
    expect(passwordProblem("longpassword")).not.toBeNull();
    expect(passwordProblem("longpassword1")).toBeNull();
  });
  it("rate limits after the threshold", async () => {
    const key = `test:${Date.now()}`;
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await rateLimit(key, 5, 60000));
    expect(results).toEqual([true, true, true, true, true, false]);
  });
  it("invitations respect plan user limits and can be accepted once", async () => {
    await db.subscription.update({ where: { tenantId: T.tenant.id }, data: { plan: { connect: { code: "FREE" } } } });
    const { plan } = await planLimits(db, T.tenant.id);
    expect(plan.maxUsers).toBe(2);
    const { token } = await tx((t) => createInvitation(t, T.tenant.id, T.user.id, { email: "acc@test.local", role: "ACCOUNTANT", companyIds: [] }));
    await expect(tx((t) => createInvitation(t, T.tenant.id, T.user.id, { email: "x2@test.local", role: "VIEWER", companyIds: [] }))).rejects.toThrow(/باقة/);
    const r = await acceptInvitation(token, { name: "محاسب", password: "Password1234" });
    const m = await db.membership.findFirstOrThrow({ where: { tenantId: T.tenant.id, userId: r.user.id } });
    expect(m.role).toBe("ACCOUNTANT");
    await expect(acceptInvitation(token, { name: "x", password: "Password1234" })).rejects.toThrow(/غير صالح/);
  });
});
