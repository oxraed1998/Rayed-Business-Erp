import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addShipmentExpense, addVehicleExpense, allocateShipment, createShipment, createVehicle, sellVehicle, setVehicleStatus } from "@/server/services/vehicles";
import { recordPayment } from "@/server/services/invoices";
import { vehicleCost } from "@/lib/domain/vehicle-cost";
import { assertBalanced, balanceOf, makeTenant, tx } from "./helpers";

let T: Awaited<ReturnType<typeof makeTenant>>;
let customer: string;
beforeAll(async () => {
  T = await makeTenant("veh");
  customer = (await db.customer.create({ data: { tenantId: T.tenant.id, companyId: T.company.id, name: "محمد" } })).id;
  await tx((t) => (t.journalEntry.count()));
});
afterAll(() => db.$disconnect());

describe("vehicle trading", () => {
  it("full purchase → expenses → sale → installments → payments cycle", async () => {
    const supplier = await db.supplier.create({ data: { tenantId: T.tenant.id, companyId: T.company.id, name: "Korea Motors", country: "KR" } });
    const v = await tx((t) => createVehicle(t, T.actor, {
      manufacturer: "Hyundai", model: "Sonata", year: 2023, vin: "KMH123", purchaseDate: new Date("2026-03-01"),
      purchaseCurrency: "USD", purchasePrice: "20000", exchangeRate: "3.75", activityId: T.act("VEHICLES"),
      supplierId: supplier.id, settlement: { accountId: "AP", supplierId: supplier.id },
    }));
    expect(await balanceOf(T.actor, T.acc("INV_VEHICLES"))).toBe("75000.00");
    expect(await balanceOf(T.actor, T.acc("AP"))).toBe("75000.00");

    await tx((t) => addVehicleExpense(t, T.actor, { vehicleId: v.id, category: "SHIPPING", amount: "4500", date: new Date("2026-03-05"), settlement: { accountId: T.acc("BANK") } }));
    await tx((t) => addVehicleExpense(t, T.actor, { vehicleId: v.id, category: "CLEARANCE", amount: "1000", vatAmount: "150", vatRecoverable: true, date: new Date("2026-03-06"), settlement: { accountId: T.acc("CASH") } }));
    await tx((t) => addVehicleExpense(t, T.actor, { vehicleId: v.id, category: "REPAIR", amount: "800", vatAmount: "120", vatRecoverable: false, date: new Date("2026-03-07"), settlement: { accountId: T.acc("CASH") } }));
    expect(await balanceOf(T.actor, T.acc("INV_VEHICLES"))).toBe("81420.00");
    expect(await balanceOf(T.actor, T.acc("VAT_INPUT"))).toBe("150.00");

    await expect(tx((t) => sellVehicle(t, T.actor, { vehicleId: v.id, customerId: customer, saleDate: new Date(), price: 1, vatRate: 15 }))).rejects.toThrow(/المخزون/);
    await tx((t) => setVehicleStatus(t, T.actor, v.id, "IN_STOCK"));

    const { invoice, profit } = await tx((t) => sellVehicle(t, T.actor, {
      vehicleId: v.id, customerId: customer, saleDate: new Date("2026-04-01"), price: "95000", vatRate: 15,
      paidNow: { amount: "20000", accountId: T.acc("BANK"), method: "BANK_TRANSFER" }, installments: { count: 6, firstDueDate: new Date("2026-05-01") },
    }));
    expect(profit.toFixed(2)).toBe("13580.00");
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { installmentPlan: { include: { installments: true } } } });
    expect(inv.total.toFixed(2)).toBe("109250.00");
    expect(inv.amountPaid.toFixed(2)).toBe("20000.00");
    expect(inv.installmentPlan!.installments).toHaveLength(6);
    expect(inv.installmentPlan!.totalAmount.toFixed(2)).toBe("89250.00");
    expect(await balanceOf(T.actor, T.acc("INV_VEHICLES"))).toBe("0.00");
    expect(await balanceOf(T.actor, T.acc("COGS_VEHICLES"))).toBe("81420.00");
    expect(await balanceOf(T.actor, T.acc("SALES_VEHICLES"))).toBe("95000.00");
    expect(await balanceOf(T.actor, T.acc("VAT_OUTPUT"))).toBe("14250.00");
    expect(await balanceOf(T.actor, T.acc("AR"))).toBe("89250.00");

    // Installment payment allocates oldest first.
    await tx((t) => recordPayment(t, T.actor, { direction: "IN", method: "CASH", date: new Date("2026-05-01"), amount: "20000", accountId: T.acc("CASH"), customerId: customer }));
    const ins = await db.installment.findMany({ where: { plan: { invoiceId: invoice.id } }, orderBy: { seq: "asc" } });
    expect(ins[0].paidAmount.toFixed(2)).toBe("14875.00");
    expect(ins[1].paidAmount.toFixed(2)).toBe("5125.00");
    expect(await balanceOf(T.actor, T.acc("AR"))).toBe("69250.00");

    // Pay the supplier.
    await tx((t) => recordPayment(t, T.actor, { direction: "OUT", method: "BANK_TRANSFER", date: new Date("2026-04-02"), amount: "75000", accountId: T.acc("BANK"), supplierId: supplier.id }));
    expect(await balanceOf(T.actor, T.acc("AP"))).toBe("0.00");
    await assertBalanced(T.actor);

    const vv = await db.vehicle.findUniqueOrThrow({ where: { id: v.id }, include: { expenses: true } });
    expect(vehicleCost({ ...vv, sellingPrice: vv.sellingPrice }).profit!.toFixed(2)).toBe("13580.00");
  });

  it("allocates shared shipment expenses by value", async () => {
    const s = await tx((t) => createShipment(t, T.actor, { reference: "SH-1", type: "VEHICLES", allocationMethod: "VALUE" }));
    const mk = (price: string, vin: string) => tx((t) => createVehicle(t, T.actor, { manufacturer: "Kia", model: "K8", year: 2024, vin, purchaseDate: new Date("2026-06-01"), purchaseCurrency: "SAR", purchasePrice: price, exchangeRate: 1, shipmentId: s.id, settlement: { accountId: T.acc("BANK") } }));
    const v1 = await mk("30000", "V1"), v2 = await mk("10000", "V2");
    await tx((t) => addShipmentExpense(t, T.actor, { shipmentId: s.id, category: "SHIPPING", amount: "4000", date: new Date("2026-06-02"), settlement: { accountId: T.acc("BANK") } }));
    expect(await balanceOf(T.actor, T.acc("GOODS_IN_TRANSIT"))).toBe("4000.00");
    await tx((t) => allocateShipment(t, T.actor, s.id));
    expect(await balanceOf(T.actor, T.acc("GOODS_IN_TRANSIT"))).toBe("0.00");
    const e1 = await db.vehicleExpense.findFirstOrThrow({ where: { vehicleId: v1.id, category: "SHIPMENT_ALLOCATION" } });
    const e2 = await db.vehicleExpense.findFirstOrThrow({ where: { vehicleId: v2.id, category: "SHIPMENT_ALLOCATION" } });
    expect([e1.amount.toFixed(2), e2.amount.toFixed(2)]).toEqual(["3000.00", "1000.00"]);
    await expect(tx((t) => allocateShipment(t, T.actor, s.id))).rejects.toThrow(/غير موزعة/);
    await assertBalanced(T.actor);
  });

  it("records the source listing and refuses importing it twice", async () => {
    const base = { manufacturer: "Kia", model: "K5", year: 2021, purchaseDate: new Date("2026-07-01"), purchaseCurrency: "KRW", purchasePrice: "11500000", exchangeRate: "0.0027", settlement: { accountId: T.acc("BANK") } };
    const v = await tx((t) => createVehicle(t, T.actor, { ...base, sourceRef: "encar:42282970" }));
    expect(v.sourceRef).toBe("encar:42282970");
    expect(await balanceOf(T.actor, T.acc("INV_VEHICLES"))).not.toBe("0.00");
    await expect(tx((t) => createVehicle(t, T.actor, { ...base, sourceRef: "encar:42282970" }))).rejects.toThrow(/مسبقًا/);
  });
});
