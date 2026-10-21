import type { AllocationMethod, VehicleStatus } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { systemAccounts } from "@/lib/accounting/chart";
import { createJournalEntry, type LineInput } from "@/lib/accounting/journal";
import { allocateLandedCost } from "@/lib/domain/allocation";
import { capitalisedCost, vehicleCost, VEHICLE_TRANSITIONS } from "@/lib/domain/vehicle-cost";
import { D, money, toDb, type DecimalLike } from "@/lib/money";
import { NotFound, ServiceError, type Actor } from "./actor";
import { assertActivity, createInvoice, postInvoice, settlementLine, createInstallmentPlan, recordPayment } from "./invoices";

export type Settlement = { accountId: string | "AP"; supplierId?: string | null };

export interface CostEntry {
  amount: DecimalLike;
  vatAmount?: DecimalLike;
  vatRecoverable?: boolean;
}

/**
 * Journal lines to capitalise a cost into an asset account:
 *   Dr asset (cost + non-recoverable VAT), Dr VAT input (recoverable VAT), Cr settlement.
 */
export async function capitaliseLines(tx: Tx, actor: Actor, assetAccountId: string, cost: CostEntry, settlement: Settlement, activityId: string | null, description: string) {
  const acc = await systemAccounts(tx, actor.companyId, ["VAT_INPUT"]);
  const vat = money(cost.vatAmount ?? 0);
  const capital = capitalisedCost(cost);
  const recoverable = cost.vatRecoverable === false ? D(0) : vat;
  const lines: LineInput[] = [
    { accountId: assetAccountId, debit: capital, activityId, description },
    { accountId: acc("VAT_INPUT"), debit: recoverable },
    await settlementLine(tx, actor, settlement, capital.plus(recoverable), description),
  ];
  return lines;
}

async function getVehicle(tx: Tx, actor: Actor, id: string) {
  const v = await tx.vehicle.findFirst({ where: { id, tenantId: actor.tenantId, companyId: actor.companyId }, include: { expenses: true } });
  if (!v) throw NotFound("السيارة");
  return v;
}

export interface VehicleInput {
  manufacturer: string;
  model: string;
  year: number;
  vin?: string | null;
  color?: string | null;
  mileage?: number | null;
  originCountry?: string | null;
  importCountry?: string | null;
  purchaseDate: Date;
  purchaseCurrency: string;
  purchasePrice: DecimalLike;
  exchangeRate: DecimalLike;
  activityId?: string | null;
  shipmentId?: string | null;
  supplierId?: string | null;
  notes?: string | null;
  sourceRef?: string | null;
  settlement: Settlement;
}

export async function createVehicle(tx: Tx, actor: Actor, input: VehicleInput) {
  const activity = await assertActivity(tx, actor, input.activityId);
  if (input.shipmentId && !(await tx.importShipment.findFirst({ where: { id: input.shipmentId, tenantId: actor.tenantId, companyId: actor.companyId } }))) throw NotFound("الشحنة");
  if (input.supplierId && !(await tx.supplier.findFirst({ where: { id: input.supplierId, tenantId: actor.tenantId, companyId: actor.companyId } }))) throw NotFound("المورد");
  if (input.vin && (await tx.vehicle.findFirst({ where: { companyId: actor.companyId, vin: input.vin } }))) throw new ServiceError("رقم الهيكل (VIN) مسجل مسبقًا");
  if (input.sourceRef && (await tx.vehicle.findFirst({ where: { companyId: actor.companyId, sourceRef: input.sourceRef } }))) throw new ServiceError("تم استيراد هذا الإعلان إلى مخزون الشركة مسبقًا");

  const base = money(D(input.purchasePrice).times(D(input.exchangeRate)));
  const vehicle = await tx.vehicle.create({
    data: {
      tenantId: actor.tenantId,
      companyId: actor.companyId,
      activityId: activity?.id ?? null,
      shipmentId: input.shipmentId ?? null,
      supplierId: input.supplierId ?? null,
      manufacturer: input.manufacturer,
      model: input.model,
      year: input.year,
      vin: input.vin || null,
      color: input.color ?? null,
      mileage: input.mileage ?? null,
      originCountry: input.originCountry ?? null,
      importCountry: input.importCountry ?? null,
      purchaseDate: input.purchaseDate,
      purchaseCurrency: input.purchaseCurrency,
      purchasePrice: toDb(input.purchasePrice),
      exchangeRate: D(input.exchangeRate).toFixed(6),
      status: input.shipmentId ? "IN_TRANSIT" : "PURCHASED",
      notes: input.notes ?? null,
      sourceRef: input.sourceRef ?? null,
    },
  });
  const acc = await systemAccounts(tx, actor.companyId, ["INV_VEHICLES"]);
  const label = `شراء ${vehicle.manufacturer} ${vehicle.model} ${vehicle.year}${vehicle.vin ? ` (${vehicle.vin})` : ""}`;
  const settle = await settlementLine(tx, actor, { ...input.settlement, supplierId: input.settlement.supplierId ?? input.supplierId }, base, label);
  const entry = await createJournalEntry(tx, {
    tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.purchaseDate,
    description: label, sourceType: "VEHICLE_PURCHASE", sourceId: vehicle.id,
    lines: [
      { accountId: acc("INV_VEHICLES"), debit: base, activityId: vehicle.activityId, currency: input.purchaseCurrency, fxRate: input.exchangeRate },
      { ...settle, currency: input.purchaseCurrency, fxRate: input.exchangeRate },
    ],
  });
  await tx.vehicle.update({ where: { id: vehicle.id }, data: { purchaseEntryId: entry.id } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "Vehicle", entityId: vehicle.id, data: { label, cost: base.toFixed(2) } });
  return vehicle;
}

export async function addVehicleExpense(
  tx: Tx,
  actor: Actor,
  input: { vehicleId: string; category: string; description?: string | null; date: Date; settlement: Settlement } & CostEntry,
) {
  const v = await getVehicle(tx, actor, input.vehicleId);
  if (v.status === "SOLD" || v.status === "CANCELLED") throw new ServiceError("لا يمكن إضافة مصروف لسيارة مباعة أو ملغاة");
  const acc = await systemAccounts(tx, actor.companyId, ["INV_VEHICLES"]);
  const desc = `${input.category} - ${v.manufacturer} ${v.model}`;
  const entry = await createJournalEntry(tx, {
    tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date,
    description: desc, sourceType: "VEHICLE_EXPENSE", sourceId: v.id,
    lines: await capitaliseLines(tx, actor, acc("INV_VEHICLES"), input, input.settlement, v.activityId, desc),
  });
  const exp = await tx.vehicleExpense.create({
    data: {
      tenantId: actor.tenantId, vehicleId: v.id, category: input.category, description: input.description ?? null,
      amount: toDb(input.amount), vatAmount: toDb(input.vatAmount ?? 0), vatRecoverable: input.vatRecoverable !== false,
      date: input.date, journalEntryId: entry.id,
    },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "VehicleExpense", entityId: exp.id, data: { vehicle: v.id, amount: exp.amount.toString() } });
  return exp;
}

export async function setVehicleStatus(tx: Tx, actor: Actor, vehicleId: string, status: VehicleStatus, deposit?: DecimalLike | null) {
  const v = await getVehicle(tx, actor, vehicleId);
  if (!VEHICLE_TRANSITIONS[v.status]?.includes(status)) throw new ServiceError("لا يمكن تغيير الحالة بهذا الشكل");
  if (status === "CANCELLED") {
    throw new ServiceError("إلغاء سيارة مشتراة يتطلب قيد تسوية/مرتجع مشتريات من شاشة القيود");
  }
  await tx.vehicle.update({
    where: { id: v.id },
    data: {
      status,
      reservedAt: status === "RESERVED" ? new Date() : null,
      reservationDeposit: status === "RESERVED" && deposit ? toDb(deposit) : null,
    },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "status", entity: "Vehicle", entityId: v.id, data: { from: v.status, to: status } });
}

export interface VehicleSaleInput {
  vehicleId: string;
  customerId: string;
  saleDate: Date;
  price: DecimalLike;
  vatRate: DecimalLike;
  /** Immediate payment received (optional). */
  paidNow?: { amount: DecimalLike; accountId: string; method: "CASH" | "BANK_TRANSFER" | "CARD" | "CHEQUE" | "OTHER" } | null;
  installments?: { count: number; firstDueDate: Date } | null;
}

/**
 * Sells a vehicle: issues & posts a sales invoice (revenue + output VAT, on the
 * customer's account), moves the landed cost from inventory to COGS, and optionally
 * records a down-payment and an installment plan.
 */
export async function sellVehicle(tx: Tx, actor: Actor, input: VehicleSaleInput) {
  const v = await getVehicle(tx, actor, input.vehicleId);
  if (v.status !== "IN_STOCK" && v.status !== "RESERVED") throw new ServiceError("يمكن بيع السيارات الموجودة في المخزون أو المحجوزة فقط");
  const acc = await systemAccounts(tx, actor.companyId, ["INV_VEHICLES", "COGS_VEHICLES", "SALES_VEHICLES"]);
  const cost = vehicleCost({ purchasePrice: v.purchasePrice, exchangeRate: v.exchangeRate, expenses: v.expenses });

  const invoice = await createInvoice(tx, actor, {
    type: "SALES",
    issueDate: input.saleDate,
    dueDate: input.saleDate,
    customerId: input.customerId,
    activityId: v.activityId,
    lines: [{
      description: `${v.manufacturer} ${v.model} ${v.year}${v.vin ? ` - VIN ${v.vin}` : ""}`,
      quantity: 1, unitPrice: input.price, vatRate: input.vatRate, accountId: acc("SALES_VEHICLES"),
    }],
  });
  await postInvoice(tx, actor, invoice.id);

  const cogsEntry = await createJournalEntry(tx, {
    tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.saleDate,
    description: `تكلفة بيع ${v.manufacturer} ${v.model} - ${invoice.number}`, sourceType: "VEHICLE_SALE", sourceId: v.id,
    lines: [
      { accountId: acc("COGS_VEHICLES"), debit: cost.landedCost, activityId: v.activityId },
      { accountId: acc("INV_VEHICLES"), credit: cost.landedCost, activityId: v.activityId },
    ],
  });
  await tx.vehicle.update({
    where: { id: v.id },
    data: { status: "SOLD", customerId: input.customerId, sellingPrice: toDb(input.price), saleDate: input.saleDate, saleVat: invoice.vatTotal, saleEntryId: cogsEntry.id },
  });

  if (input.paidNow && D(input.paidNow.amount).gt(0)) {
    await recordPayment(tx, actor, {
      direction: "IN", method: input.paidNow.method, date: input.saleDate, amount: input.paidNow.amount,
      accountId: input.paidNow.accountId, customerId: input.customerId, allocations: [{ invoiceId: invoice.id, amount: input.paidNow.amount }],
      reference: invoice.number,
    });
  }
  if (input.installments) {
    await createInstallmentPlan(tx, actor, { invoiceId: invoice.id, downPayment: 0, count: input.installments.count, firstDueDate: input.installments.firstDueDate });
  }
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "sell", entity: "Vehicle", entityId: v.id, data: { invoice: invoice.number, price: D(input.price).toFixed(2), cost: cost.landedCost.toFixed(2) } });
  return { invoice, profit: money(D(input.price).minus(cost.landedCost)) };
}

// ───────────────────────────── Import shipments ─────────────────────────────

export async function createShipment(
  tx: Tx,
  actor: Actor,
  input: { reference: string; type: "VEHICLES" | "LIVESTOCK" | "CLOTHING" | "GENERAL"; originCountry?: string | null; allocationMethod: AllocationMethod; activityId?: string | null; shippedAt?: Date | null; notes?: string | null },
) {
  await assertActivity(tx, actor, input.activityId);
  if (await tx.importShipment.findFirst({ where: { companyId: actor.companyId, reference: input.reference } })) throw new ServiceError("رقم الشحنة مستخدم");
  const s = await tx.importShipment.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, ...input } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "ImportShipment", entityId: s.id, data: { reference: s.reference } });
  return s;
}

/** Shared shipment cost: parked in "goods in transit" until allocated to the shipment's items. */
export async function addShipmentExpense(
  tx: Tx,
  actor: Actor,
  input: { shipmentId: string; category: string; description?: string | null; date: Date; settlement: Settlement } & CostEntry,
) {
  const s = await tx.importShipment.findFirst({ where: { id: input.shipmentId, tenantId: actor.tenantId, companyId: actor.companyId } });
  if (!s) throw NotFound("الشحنة");
  const acc = await systemAccounts(tx, actor.companyId, ["GOODS_IN_TRANSIT"]);
  const desc = `${input.category} - شحنة ${s.reference}`;
  const exp = await tx.shipmentExpense.create({
    data: {
      tenantId: actor.tenantId, shipmentId: s.id, category: input.category, description: input.description ?? null,
      amount: toDb(input.amount), vatAmount: toDb(input.vatAmount ?? 0), vatRecoverable: input.vatRecoverable !== false, date: input.date,
    },
  });
  await createJournalEntry(tx, {
    tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date,
    description: desc, sourceType: "SHIPMENT_EXPENSE", sourceId: exp.id,
    lines: await capitaliseLines(tx, actor, acc("GOODS_IN_TRANSIT"), input, input.settlement, s.activityId, desc),
  });
  return exp;
}

/**
 * Allocates all unallocated shipment expenses to the shipment's vehicles / herds /
 * clothing receipts using the shipment's allocation method, moving the cost from
 * goods-in-transit into the right inventory account. Each expense is allocated once.
 */
export async function allocateShipment(tx: Tx, actor: Actor, shipmentId: string) {
  const s = await tx.importShipment.findFirst({
    where: { id: shipmentId, tenantId: actor.tenantId, companyId: actor.companyId },
    include: {
      expenses: { where: { allocatedAt: null } },
      vehicles: { where: { status: { notIn: ["SOLD", "CANCELLED"] } } },
      herds: { include: { events: true } },
      movements: { where: { type: "PURCHASE" }, include: { variant: true } },
    },
  });
  if (!s) throw NotFound("الشحنة");
  if (!s.expenses.length) throw new ServiceError("لا توجد مصاريف غير موزعة في هذه الشحنة");
  const acc = await systemAccounts(tx, actor.companyId, ["GOODS_IN_TRANSIT", "INV_VEHICLES", "INV_LIVESTOCK", "INV_CLOTHING"]);
  const today = new Date();

  for (const exp of s.expenses) {
    const total = capitalisedCost(exp);
    const lines: LineInput[] = [{ accountId: acc("GOODS_IN_TRANSIT"), credit: total }];
    if (s.vehicles.length) {
      const parts = allocateLandedCost(total, s.vehicles.map((v) => ({ id: v.id, quantity: 1, value: D(v.purchasePrice).times(v.exchangeRate) })), s.allocationMethod === "QUANTITY" ? "QUANTITY" : "VALUE");
      for (const v of s.vehicles) {
        const amt = parts.get(v.id)!;
        await tx.vehicleExpense.create({ data: { tenantId: actor.tenantId, vehicleId: v.id, category: "SHIPMENT_ALLOCATION", description: `${exp.category} - ${s.reference}`, amount: toDb(amt), vatRecoverable: true, date: today, shipmentExpenseId: exp.id } });
        lines.push({ accountId: acc("INV_VEHICLES"), debit: amt, activityId: v.activityId });
      }
    } else if (s.herds.length) {
      const items = s.herds.map((h) => ({ id: h.id, quantity: h.events.filter((e) => e.type === "PURCHASE").reduce((a, e) => a + e.quantity, 0), value: h.events.filter((e) => e.type === "PURCHASE").reduce((a, e) => a.plus(e.amount), D(0)) }));
      const parts = allocateLandedCost(total, items, s.allocationMethod === "QUANTITY" ? "QUANTITY" : "VALUE");
      for (const h of s.herds) {
        const amt = parts.get(h.id)!;
        await tx.livestockExpense.create({ data: { tenantId: actor.tenantId, herdId: h.id, category: "SHIPPING", description: `${exp.category} - ${s.reference}`, amount: toDb(amt), date: today } });
        lines.push({ accountId: acc("INV_LIVESTOCK"), debit: amt, activityId: h.activityId });
      }
    } else if (s.movements.length) {
      const items = s.movements.map((m) => ({
        id: m.id, quantity: m.quantity, value: m.totalCost,
        weight: D(m.variant.weightKg ?? 0).times(m.quantity), volume: D(m.variant.volumeM3 ?? 0).times(m.quantity),
      }));
      const parts = allocateLandedCost(total, items, s.allocationMethod);
      for (const m of s.movements) {
        const amt = parts.get(m.id)!;
        const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: m.variantId } });
        if (D(variant.quantityOnHand).isZero()) throw new ServiceError(`الصنف ${variant.sku} نفد من المخزون؛ لا يمكن تحميل التكلفة عليه`);
        await tx.productVariant.update({ where: { id: variant.id }, data: { stockValue: toDb(D(variant.stockValue).plus(amt)) } });
        await tx.inventoryMovement.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, variantId: m.variantId, warehouseId: m.warehouseId, shipmentId: s.id, type: "LANDED_COST", quantity: "0", totalCost: toDb(amt), date: today, note: `${exp.category} - ${s.reference}` } });
        lines.push({ accountId: acc("INV_CLOTHING"), debit: amt });
      }
    } else {
      throw new ServiceError("لا توجد بنود (سيارات/قطعان/أصناف) مرتبطة بالشحنة لتوزيع المصاريف عليها");
    }
    await createJournalEntry(tx, {
      tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: today,
      description: `توزيع ${exp.category} - شحنة ${s.reference}`, sourceType: "SHIPMENT_ALLOCATION", sourceId: exp.id, lines,
    });
    await tx.shipmentExpense.update({ where: { id: exp.id }, data: { allocatedAt: today } });
  }
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "allocate", entity: "ImportShipment", entityId: s.id, data: { expenses: s.expenses.length } });
}
