import { randomUUID } from "node:crypto";
import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { systemAccounts } from "@/lib/accounting/chart";
import { createJournalEntry, type LineInput } from "@/lib/accounting/journal";
import { issue, receive, type StockState } from "@/lib/domain/inventory";
import { D, money, toDb, type DecimalLike } from "@/lib/money";
import { NotFound, ServiceError, type Actor } from "./actor";
import { createInvoice, postInvoice, recordPayment, settlementLine } from "./invoices";
import type { Settlement } from "./vehicles";

async function lockVariant(tx: Tx, actor: Actor, variantId: string) {
  await tx.$queryRaw`SELECT 1 FROM "ProductVariant" WHERE "id" = ${variantId} FOR UPDATE`;
  const v = await tx.productVariant.findFirst({ where: { id: variantId, tenantId: actor.tenantId, product: { companyId: actor.companyId } }, include: { product: true } });
  if (!v) throw NotFound("الصنف");
  return v;
}

async function assertWarehouse(tx: Tx, actor: Actor, id: string) {
  const w = await tx.warehouse.findFirst({ where: { id, tenantId: actor.tenantId, companyId: actor.companyId } });
  if (!w) throw NotFound("المستودع");
  return w;
}

export async function warehouseQty(tx: Tx, variantId: string, warehouseId: string) {
  const r = await tx.inventoryMovement.aggregate({ where: { variantId, warehouseId }, _sum: { quantity: true } });
  return D(r._sum.quantity ?? 0);
}

const state = (v: { quantityOnHand: DecimalLike; stockValue: DecimalLike }): StockState => ({ quantity: D(v.quantityOnHand), value: D(v.stockValue) });

export async function createProduct(
  tx: Tx,
  actor: Actor,
  input: { name: string; category?: string | null; brand?: string | null; activityId?: string | null; variants: { sku: string; barcode?: string | null; size?: string | null; color?: string | null; sellingPrice: DecimalLike; reorderLevel?: number; weightKg?: DecimalLike | null; volumeM3?: DecimalLike | null }[] },
) {
  if (!input.variants.length) throw new ServiceError("أضف مقاسًا/لونًا واحدًا على الأقل");
  const skus = input.variants.map((v) => v.sku);
  if (new Set(skus).size !== skus.length) throw new ServiceError("رموز SKU مكررة");
  const dup = await tx.productVariant.findFirst({ where: { tenantId: actor.tenantId, sku: { in: skus } } });
  if (dup) throw new ServiceError(`رمز SKU ${dup.sku} مستخدم`);
  const p = await tx.product.create({
    data: {
      tenantId: actor.tenantId, companyId: actor.companyId, name: input.name, category: input.category ?? null, brand: input.brand ?? null, activityId: input.activityId ?? null,
      variants: { create: input.variants.map((v) => ({ tenantId: actor.tenantId, sku: v.sku, barcode: v.barcode ?? null, size: v.size ?? null, color: v.color ?? null, sellingPrice: toDb(v.sellingPrice), reorderLevel: v.reorderLevel ?? 0, weightKg: v.weightKg ? D(v.weightKg).toFixed(3) : null, volumeM3: v.volumeM3 ? D(v.volumeM3).toFixed(4) : null })) },
    },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "Product", entityId: p.id, data: { name: p.name, variants: skus } });
  return p;
}

/** Purchase receipt: stock in at landed unit cost (converted to base currency). */
export async function receiveStock(
  tx: Tx,
  actor: Actor,
  input: { variantId: string; warehouseId: string; quantity: DecimalLike; unitCost: DecimalLike; currency: string; fxRate: DecimalLike; date: Date; shipmentId?: string | null; settlement: Settlement; note?: string | null },
) {
  const v = await lockVariant(tx, actor, input.variantId);
  await assertWarehouse(tx, actor, input.warehouseId);
  if (input.shipmentId && !(await tx.importShipment.findFirst({ where: { id: input.shipmentId, tenantId: actor.tenantId, companyId: actor.companyId } }))) throw NotFound("الشحنة");
  const total = money(D(input.quantity).times(input.unitCost).times(input.fxRate));
  const next = receive(state(v), input.quantity, total);
  const acc = await systemAccounts(tx, actor.companyId, ["INV_CLOTHING"]);
  const desc = `شراء ${D(input.quantity).toString()} × ${v.sku}`;
  const entry = await createJournalEntry(tx, {
    tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date, description: desc, sourceType: "STOCK_PURCHASE",
    lines: [
      { accountId: acc("INV_CLOTHING"), debit: total, activityId: v.product.activityId, currency: input.currency, fxRate: input.fxRate },
      { ...(await settlementLine(tx, actor, input.settlement, total, desc)), currency: input.currency, fxRate: input.fxRate },
    ],
  });
  await tx.productVariant.update({ where: { id: v.id }, data: { quantityOnHand: next.quantity.toFixed(3), stockValue: toDb(next.value) } });
  return tx.inventoryMovement.create({
    data: { tenantId: actor.tenantId, companyId: actor.companyId, variantId: v.id, warehouseId: input.warehouseId, shipmentId: input.shipmentId ?? null, type: "PURCHASE", quantity: D(input.quantity).toFixed(3), totalCost: toDb(total), currency: input.currency, fxRate: D(input.fxRate).toFixed(6), date: input.date, note: input.note ?? null, journalEntryId: entry.id },
  });
}

/** Multi-line sale: one invoice, weighted-average COGS per line. */
export async function sellStock(
  tx: Tx,
  actor: Actor,
  input: { customerId: string; warehouseId: string; date: Date; vatRate: DecimalLike; lines: { variantId: string; quantity: DecimalLike; unitPrice: DecimalLike; discount?: DecimalLike }[]; paidNow?: { amount: DecimalLike; accountId: string } | null },
) {
  await assertWarehouse(tx, actor, input.warehouseId);
  if (!input.lines.length) throw new ServiceError("أضف صنفًا واحدًا على الأقل");
  if (new Set(input.lines.map((l) => l.variantId)).size !== input.lines.length) throw new ServiceError("لا تكرر نفس الصنف في أكثر من سطر");
  const acc = await systemAccounts(tx, actor.companyId, ["INV_CLOTHING", "COGS_CLOTHING", "SALES_CLOTHING"]);
  const prepared = [];
  for (const l of input.lines) {
    const v = await lockVariant(tx, actor, l.variantId);
    const inWh = await warehouseQty(tx, v.id, input.warehouseId);
    if (D(l.quantity).greaterThan(inWh)) throw new ServiceError(`الكمية المتوفرة من ${v.sku} في المستودع ${inWh.toString()} فقط`);
    const { state: next, cost } = issue(state(v), l.quantity);
    prepared.push({ l, v, next, cost });
  }
  const invoice = await createInvoice(tx, actor, {
    type: "SALES", issueDate: input.date, dueDate: input.date, customerId: input.customerId, activityId: prepared[0]?.v.product.activityId ?? null,
    lines: prepared.map(({ l, v }) => ({ description: `${v.product.name} ${[v.size, v.color].filter(Boolean).join(" / ")} (${v.sku})`, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, vatRate: input.vatRate, accountId: acc("SALES_CLOTHING") })),
  });
  await postInvoice(tx, actor, invoice.id);
  const cogsLines: LineInput[] = [];
  for (const { l, v, next, cost } of prepared) {
    await tx.productVariant.update({ where: { id: v.id }, data: { quantityOnHand: next.quantity.toFixed(3), stockValue: toDb(next.value) } });
    await tx.inventoryMovement.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, variantId: v.id, warehouseId: input.warehouseId, type: "SALE", quantity: D(l.quantity).neg().toFixed(3), totalCost: toDb(cost.neg()), revenue: toDb(D(l.quantity).times(l.unitPrice).minus(D(l.discount ?? 0))), date: input.date, note: invoice.number } });
    cogsLines.push({ accountId: acc("COGS_CLOTHING"), debit: cost, activityId: v.product.activityId }, { accountId: acc("INV_CLOTHING"), credit: cost, activityId: v.product.activityId });
  }
  if (cogsLines.some((c) => D(c.debit ?? 0).gt(0))) {
    await createJournalEntry(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date, description: `تكلفة مبيعات ${invoice.number}`, sourceType: "STOCK_SALE", sourceId: invoice.id, lines: cogsLines });
  }
  if (input.paidNow && D(input.paidNow.amount).gt(0)) {
    await recordPayment(tx, actor, { direction: "IN", method: "CASH", date: input.date, amount: input.paidNow.amount, accountId: input.paidNow.accountId, customerId: input.customerId, allocations: [{ invoiceId: invoice.id, amount: input.paidNow.amount }], reference: invoice.number });
  }
  return invoice;
}

/** Customer return: credit note for the refund value and stock back at current average cost. */
export async function returnFromCustomer(
  tx: Tx,
  actor: Actor,
  input: { invoiceId: string; warehouseId: string; date: Date; variantId: string; quantity: DecimalLike; unitPrice: DecimalLike; vatRate: DecimalLike },
) {
  await assertWarehouse(tx, actor, input.warehouseId);
  const original = await tx.invoice.findFirst({ where: { id: input.invoiceId, tenantId: actor.tenantId, companyId: actor.companyId, type: "SALES", status: "POSTED" } });
  if (!original) throw NotFound("فاتورة البيع");
  const v = await lockVariant(tx, actor, input.variantId);
  const sold = await tx.inventoryMovement.aggregate({ where: { variantId: v.id, type: "SALE", note: original.number }, _sum: { quantity: true } });
  const returned = await tx.inventoryMovement.aggregate({ where: { variantId: v.id, type: "RETURN_IN", note: original.number }, _sum: { quantity: true } });
  const soldQty = D(sold._sum.quantity ?? 0).neg();
  if (D(input.quantity).plus(D(returned._sum.quantity ?? 0)).greaterThan(soldQty)) throw new ServiceError("كمية المرتجع أكبر من المباع في الفاتورة");
  // Cost back = the average cost removed when this invoice sold the item.
  const soldCost = await tx.inventoryMovement.aggregate({ where: { variantId: v.id, type: "SALE", note: original.number }, _sum: { totalCost: true } });
  const unitCost = soldQty.isZero() ? D(0) : D(soldCost._sum.totalCost ?? 0).neg().div(soldQty);
  const cost = money(unitCost.times(input.quantity));
  const acc = await systemAccounts(tx, actor.companyId, ["INV_CLOTHING", "COGS_CLOTHING", "SALES_CLOTHING"]);
  const cn = await createInvoice(tx, actor, {
    type: "CREDIT_NOTE", issueDate: input.date, customerId: original.customerId, activityId: original.activityId, relatedInvoiceId: original.id,
    lines: [{ description: `مرتجع ${v.sku} من ${original.number}`, quantity: input.quantity, unitPrice: input.unitPrice, vatRate: input.vatRate, accountId: acc("SALES_CLOTHING") }],
  });
  await postInvoice(tx, actor, cn.id);
  const next = receive(state(v), input.quantity, cost);
  await tx.productVariant.update({ where: { id: v.id }, data: { quantityOnHand: next.quantity.toFixed(3), stockValue: toDb(next.value) } });
  await tx.inventoryMovement.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, variantId: v.id, warehouseId: input.warehouseId, type: "RETURN_IN", quantity: D(input.quantity).toFixed(3), totalCost: toDb(cost), date: input.date, note: original.number } });
  if (cost.gt(0)) {
    await createJournalEntry(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date, description: `إرجاع تكلفة ${cn.number}`, sourceType: "STOCK_RETURN", sourceId: cn.id, lines: [{ accountId: acc("INV_CLOTHING"), debit: cost }, { accountId: acc("COGS_CLOTHING"), credit: cost }] });
  }
  return cn;
}

/** Physical count adjustment: positive adds at current average cost, negative writes off. */
export async function adjustStock(tx: Tx, actor: Actor, input: { variantId: string; warehouseId: string; quantity: DecimalLike; unitCost?: DecimalLike | null; date: Date; note: string }) {
  const v = await lockVariant(tx, actor, input.variantId);
  await assertWarehouse(tx, actor, input.warehouseId);
  const q = D(input.quantity);
  if (q.isZero()) throw new ServiceError("كمية التسوية لا يمكن أن تكون صفرًا");
  const acc = await systemAccounts(tx, actor.companyId, ["INV_CLOTHING", "INVENTORY_ADJUSTMENT"]);
  let next: StockState, cost;
  if (q.gt(0)) {
    const s = state(v);
    const unit = input.unitCost != null ? D(input.unitCost) : s.quantity.isZero() ? D(0) : s.value.div(s.quantity);
    cost = money(unit.times(q));
    next = receive(s, q, cost);
  } else {
    const inWh = await warehouseQty(tx, v.id, input.warehouseId);
    if (q.neg().greaterThan(inWh)) throw new ServiceError("كمية التسوية أكبر من المتوفر في المستودع");
    const r = issue(state(v), q.neg());
    next = r.state;
    cost = r.cost.neg();
  }
  await tx.productVariant.update({ where: { id: v.id }, data: { quantityOnHand: next.quantity.toFixed(3), stockValue: toDb(next.value) } });
  let entryId: string | null = null;
  if (!cost.isZero()) {
    const entry = await createJournalEntry(tx, {
      tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date, description: `تسوية مخزون ${v.sku}: ${input.note}`, sourceType: "STOCK_ADJUSTMENT",
      lines: cost.gt(0)
        ? [{ accountId: acc("INV_CLOTHING"), debit: cost }, { accountId: acc("INVENTORY_ADJUSTMENT"), credit: cost }]
        : [{ accountId: acc("INVENTORY_ADJUSTMENT"), debit: cost.neg() }, { accountId: acc("INV_CLOTHING"), credit: cost.neg() }],
    });
    entryId = entry.id;
  }
  return tx.inventoryMovement.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, variantId: v.id, warehouseId: input.warehouseId, type: "ADJUSTMENT", quantity: q.toFixed(3), totalCost: toDb(cost), date: input.date, note: input.note, journalEntryId: entryId } });
}

/** Warehouse transfer: quantity moves, total value is unchanged (no journal needed). */
export async function transferStock(tx: Tx, actor: Actor, input: { variantId: string; fromWarehouseId: string; toWarehouseId: string; quantity: DecimalLike; date: Date; note?: string | null }) {
  if (input.fromWarehouseId === input.toWarehouseId) throw new ServiceError("اختر مستودعين مختلفين");
  const v = await lockVariant(tx, actor, input.variantId);
  await assertWarehouse(tx, actor, input.fromWarehouseId);
  await assertWarehouse(tx, actor, input.toWarehouseId);
  const q = D(input.quantity);
  if (!q.gt(0)) throw new ServiceError("الكمية يجب أن تكون أكبر من صفر");
  const inWh = await warehouseQty(tx, v.id, input.fromWarehouseId);
  if (q.greaterThan(inWh)) throw new ServiceError(`المتوفر في المستودع المصدر ${inWh.toString()} فقط`);
  const unit = D(v.quantityOnHand).isZero() ? D(0) : D(v.stockValue).div(v.quantityOnHand);
  const value = money(unit.times(q));
  const group = randomUUID();
  const base = { tenantId: actor.tenantId, companyId: actor.companyId, variantId: v.id, date: input.date, note: input.note ?? null, transferGroup: group };
  await tx.inventoryMovement.create({ data: { ...base, warehouseId: input.fromWarehouseId, type: "TRANSFER_OUT", quantity: q.neg().toFixed(3), totalCost: toDb(value.neg()) } });
  await tx.inventoryMovement.create({ data: { ...base, warehouseId: input.toWarehouseId, type: "TRANSFER_IN", quantity: q.toFixed(3), totalCost: toDb(value) } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "transfer", entity: "ProductVariant", entityId: v.id, data: { qty: q.toString(), from: input.fromWarehouseId, to: input.toWarehouseId } });
}
