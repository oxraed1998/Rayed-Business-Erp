import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { closePeriod, createManualEntry, createPeriod, reverseEntry } from "@/server/services/accounting";
import { assertBalanced, balanceOf, makeTenant, tx } from "./helpers";

let T: Awaited<ReturnType<typeof makeTenant>>;
beforeAll(async () => { T = await makeTenant("acc"); });
afterAll(() => db.$disconnect());

describe("double-entry ledger", () => {
  it("posts balanced manual entries", async () => {
    await tx((t) => createManualEntry(t, T.actor, { date: new Date("2026-02-01"), description: "رأس مال", post: true, lines: [{ accountId: T.acc("BANK"), debit: "60000" }, { accountId: T.acc("CAPITAL"), credit: "60000" }] }));
    expect(await balanceOf(T.actor, T.acc("BANK"))).toBe("60000.00");
    await assertBalanced(T.actor);
  });
  it("rejects unbalanced entries", async () => {
    await expect(tx((t) => createManualEntry(t, T.actor, { date: new Date(), description: "x", post: true, lines: [{ accountId: T.acc("BANK"), debit: 1 }, { accountId: T.acc("CAPITAL"), credit: 2 }] }))).rejects.toThrow(/متوازن/);
  });
  it("database blocks editing or deleting posted entries and lines", async () => {
    const e = await db.journalEntry.findFirstOrThrow({ where: { companyId: T.company.id, status: "POSTED" }, include: { lines: true } });
    await expect(db.journalLine.update({ where: { id: e.lines[0].id }, data: { debit: "1" } })).rejects.toThrow(/immutable/);
    await expect(db.journalEntry.update({ where: { id: e.id }, data: { description: "edited" } })).rejects.toThrow(/immutable/);
    await expect(db.journalEntry.delete({ where: { id: e.id } })).rejects.toThrow();
  });
  it("database refuses to post an unbalanced entry inserted directly", async () => {
    await expect(db.$transaction(async (t) => {
      const e = await t.journalEntry.create({ data: { tenantId: T.tenant.id, companyId: T.company.id, number: "RAW-1", date: new Date(), description: "raw", lines: { create: [{ tenantId: T.tenant.id, accountId: T.acc("BANK"), debit: "5" }, { tenantId: T.tenant.id, accountId: T.acc("CAPITAL"), credit: "4" }] } } });
      await t.journalEntry.update({ where: { id: e.id }, data: { status: "POSTED" } });
    })).rejects.toThrow(/not balanced/);
  });
  it("reverses an entry with a mirror entry", async () => {
    const e = await tx((t) => createManualEntry(t, T.actor, { date: new Date("2026-02-02"), description: "خطأ", post: true, lines: [{ accountId: T.acc("CASH"), debit: 100 }, { accountId: T.acc("BANK"), credit: 100 }] }));
    await tx((t) => reverseEntry(t, T.actor, e.id, new Date("2026-02-03")));
    expect(await balanceOf(T.actor, T.acc("CASH"))).toBe("0.00");
    await expect(tx((t) => reverseEntry(t, T.actor, e.id, new Date()))).rejects.toThrow();
  });
  it("closes a period into retained earnings and blocks later postings", async () => {
    const p = await tx((t) => createPeriod(t, T.actor, { name: "2025", startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") }));
    const sales = await db.account.findFirstOrThrow({ where: { companyId: T.company.id, systemKey: "SALES_GENERAL" } });
    const rent = await db.account.findFirstOrThrow({ where: { companyId: T.company.id, systemKey: "RENT" } });
    await tx((t) => createManualEntry(t, T.actor, { date: new Date("2025-06-01"), description: "بيع", post: true, lines: [{ accountId: T.acc("CASH"), debit: 1000 }, { accountId: sales.id, credit: 1000 }] }));
    await tx((t) => createManualEntry(t, T.actor, { date: new Date("2025-06-02"), description: "إيجار", post: true, lines: [{ accountId: rent.id, debit: 300 }, { accountId: T.acc("CASH"), credit: 300 }] }));
    const r = await tx((t) => closePeriod(t, T.actor, p.id));
    expect(r.net.toFixed(2)).toBe("700.00");
    expect(await balanceOf(T.actor, T.acc("RETAINED_EARNINGS"))).toBe("700.00");
    await expect(tx((t) => createManualEntry(t, T.actor, { date: new Date("2025-07-01"), description: "متأخر", post: true, lines: [{ accountId: T.acc("CASH"), debit: 1 }, { accountId: sales.id, credit: 1 }] }))).rejects.toThrow(/مقفلة/);
    await assertBalanced(T.actor);
  });
});
