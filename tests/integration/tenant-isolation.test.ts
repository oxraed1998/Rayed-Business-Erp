import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createInvoice, recordPayment } from "@/server/services/invoices";
import { createVehicle, addVehicleExpense } from "@/server/services/vehicles";
import { createManualEntry } from "@/server/services/accounting";
import { makeTenant, tx } from "./helpers";

let A: Awaited<ReturnType<typeof makeTenant>>;
let B: Awaited<ReturnType<typeof makeTenant>>;
let customerA: string;
let vehicleA: string;

beforeAll(async () => {
  A = await makeTenant("a");
  B = await makeTenant("b");
  customerA = (await db.customer.create({ data: { tenantId: A.tenant.id, companyId: A.company.id, name: "عميل أ" } })).id;
  vehicleA = (await tx((t) => createVehicle(t, A.actor, { manufacturer: "Kia", model: "K5", year: 2022, purchaseDate: new Date("2026-01-01"), purchaseCurrency: "SAR", purchasePrice: 50000, exchangeRate: 1, settlement: { accountId: A.acc("CASH") } }))).id;
});
afterAll(() => db.$disconnect());

describe("tenant isolation", () => {
  it("cannot invoice another tenant's customer", async () => {
    await expect(tx((t) => createInvoice(t, B.actor, { type: "SALES", issueDate: new Date(), customerId: customerA, lines: [{ description: "x", quantity: 1, unitPrice: 10 }] }))).rejects.toThrow(/العميل/);
  });
  it("cannot add expenses to another tenant's vehicle", async () => {
    await expect(tx((t) => addVehicleExpense(t, B.actor, { vehicleId: vehicleA, category: "REPAIR", amount: 10, date: new Date(), settlement: { accountId: B.acc("CASH") } }))).rejects.toThrow(/السيارة/);
  });
  it("cannot post to another tenant's accounts", async () => {
    await expect(tx((t) => createManualEntry(t, B.actor, { date: new Date(), description: "hack", post: true, lines: [{ accountId: A.acc("CASH"), debit: 10 }, { accountId: B.acc("CASH"), credit: 10 }] }))).rejects.toThrow(/حساب غير صالح/);
  });
  it("cannot pay into another tenant's cash account", async () => {
    const custB = await db.customer.create({ data: { tenantId: B.tenant.id, companyId: B.company.id, name: "عميل ب" } });
    await expect(tx((t) => recordPayment(t, B.actor, { direction: "IN", method: "CASH", date: new Date(), amount: 5, accountId: A.acc("CASH"), customerId: custB.id }))).rejects.toThrow(/الصندوق/);
  });
  it("database rejects rows whose tenant differs from the company's tenant", async () => {
    await expect(db.customer.create({ data: { tenantId: B.tenant.id, companyId: A.company.id, name: "x" } })).rejects.toThrow();
  });
  it("same-company actor with wrong tenant sees nothing", async () => {
    const found = await db.vehicle.findFirst({ where: { id: vehicleA, tenantId: B.tenant.id } });
    expect(found).toBeNull();
  });
});
