import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addHerdExpense, createHerd, recordHerdDeath, recordHerdPurchase, sellFromHerd } from "@/server/services/livestock";
import { adjustStock, createProduct, receiveStock, returnFromCustomer, sellStock, transferStock, warehouseQty } from "@/server/services/inventory";
import { herdSummary } from "@/lib/domain/livestock";
import { assertBalanced, balanceOf, makeTenant, tx } from "./helpers";

let T: Awaited<ReturnType<typeof makeTenant>>;
let customer: string;
beforeAll(async () => {
  T = await makeTenant("live");
  customer = (await db.customer.create({ data: { tenantId: T.tenant.id, companyId: T.company.id, name: "سالم" } })).id;
});
afterAll(() => db.$disconnect());

describe("livestock", () => {
  it("100 imported, 20 sold, 3 died → 77 remaining at average cost", async () => {
    const h = await tx((t) => createHerd(t, T.actor, { name: "دفعة 1", species: "أغنام", breed: "نعيمي", activityId: T.act("LIVESTOCK") }));
    await tx((t) => recordHerdPurchase(t, T.actor, { herdId: h.id, date: new Date("2026-01-10"), quantity: 100, amount: "80000", settlement: { accountId: T.acc("BANK") } }));
    await tx((t) => addHerdExpense(t, T.actor, { herdId: h.id, category: "FEED", amount: "5000", date: new Date("2026-01-20"), settlement: { accountId: T.acc("CASH") } }));
    const sale = await tx((t) => sellFromHerd(t, T.actor, { herdId: h.id, customerId: customer, date: new Date("2026-02-01"), quantity: 20, unitPrice: "1200", vatRate: 15 }));
    expect(sale.cost.toFixed(2)).toBe("17000.00");
    expect(sale.profit.toFixed(2)).toBe("7000.00");
    await tx((t) => recordHerdDeath(t, T.actor, { herdId: h.id, date: new Date("2026-02-05"), quantity: 3 }));
    const full = await db.livestockHerd.findUniqueOrThrow({ where: { id: h.id }, include: { events: true, expenses: true } });
    const s = herdSummary(full.events, full.expenses);
    expect(s.remaining).toBe(77);
    expect(s.valuation.toFixed(2)).toBe("65450.00");
    expect(s.costPerHead.toFixed(2)).toBe("850.00");
    expect(await balanceOf(T.actor, T.acc("INV_LIVESTOCK"))).toBe("65450.00");
    await expect(tx((t) => sellFromHerd(t, T.actor, { herdId: h.id, customerId: customer, date: new Date(), quantity: 78, unitPrice: 1, vatRate: 15 }))).rejects.toThrow(/أكبر من المتبقي/);
    await assertBalanced(T.actor);
  });
});

describe("clothing inventory", () => {
  it("purchase, sale, return, adjustment and transfer keep stock and ledger consistent", async () => {
    const p = await tx((t) => createProduct(t, T.actor, { name: "ثوب", category: "رجالي", variants: [{ sku: "THB-M-W", size: "M", color: "أبيض", sellingPrice: "150", reorderLevel: 5 }] }));
    const v = await db.productVariant.findFirstOrThrow({ where: { productId: p.id } });
    const wh2 = await db.warehouse.create({ data: { tenantId: T.tenant.id, companyId: T.company.id, name: "فرع جدة" } });
    await tx((t) => receiveStock(t, T.actor, { variantId: v.id, warehouseId: T.warehouse.id, quantity: 10, unitCost: "10", currency: "USD", fxRate: "3.75", date: new Date("2026-03-01"), settlement: { accountId: T.acc("BANK") } }));
    await tx((t) => receiveStock(t, T.actor, { variantId: v.id, warehouseId: T.warehouse.id, quantity: 20, unitCost: "40", currency: "SAR", fxRate: 1, date: new Date("2026-03-02"), settlement: { accountId: T.acc("BANK") } }));
    // value 375 + 800 = 1175 for 30 units
    expect(await balanceOf(T.actor, T.acc("INV_CLOTHING"))).toBe("1175.00");
    const inv = await tx((t) => sellStock(t, T.actor, { customerId: customer, warehouseId: T.warehouse.id, date: new Date("2026-03-03"), vatRate: 15, lines: [{ variantId: v.id, quantity: 6, unitPrice: "150" }] }));
    expect(await balanceOf(T.actor, T.acc("INV_CLOTHING"))).toBe("940.00");
    await tx((t) => returnFromCustomer(t, T.actor, { invoiceId: inv.id, warehouseId: T.warehouse.id, date: new Date("2026-03-04"), variantId: v.id, quantity: 1, unitPrice: "150", vatRate: 15 }));
    expect(await balanceOf(T.actor, T.acc("INV_CLOTHING"))).toBe("979.17");
    await expect(tx((t) => returnFromCustomer(t, T.actor, { invoiceId: inv.id, warehouseId: T.warehouse.id, date: new Date(), variantId: v.id, quantity: 6, unitPrice: "150", vatRate: 15 }))).rejects.toThrow(/المرتجع/);
    await tx((t) => transferStock(t, T.actor, { variantId: v.id, fromWarehouseId: T.warehouse.id, toWarehouseId: wh2.id, quantity: 5, date: new Date("2026-03-05") }));
    expect((await warehouseQty(db, v.id, wh2.id)).toString()).toBe("5");
    expect((await warehouseQty(db, v.id, T.warehouse.id)).toString()).toBe("20");
    await expect(tx((t) => sellStock(t, T.actor, { customerId: customer, warehouseId: wh2.id, date: new Date(), vatRate: 15, lines: [{ variantId: v.id, quantity: 6, unitPrice: 1 }] }))).rejects.toThrow(/المتوفرة/);
    await tx((t) => adjustStock(t, T.actor, { variantId: v.id, warehouseId: T.warehouse.id, quantity: -2, date: new Date("2026-03-06"), note: "تالف" }));
    const vv = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(vv.quantityOnHand.toString()).toBe("23");
    expect(await balanceOf(T.actor, T.acc("INV_CLOTHING"))).toBe(vv.stockValue.toFixed(2));
    await assertBalanced(T.actor);
  });
});
