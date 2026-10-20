import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { systemAccounts } from "@/lib/accounting/chart";
import { createJournalEntry } from "@/lib/accounting/journal";
import { costOfRemoval, herdSummary } from "@/lib/domain/livestock";
import { D, money, toDb, type DecimalLike } from "@/lib/money";
import { NotFound, ServiceError, type Actor } from "./actor";
import { assertActivity, createInvoice, postInvoice, recordPayment, settlementLine } from "./invoices";
import { capitaliseLines, type CostEntry, type Settlement } from "./vehicles";

async function loadHerd(tx: Tx, actor: Actor, herdId: string) {
  // Row lock serialises concurrent sales/deaths so counts and costs stay consistent.
  await tx.$queryRaw`SELECT 1 FROM "LivestockHerd" WHERE "id" = ${herdId} FOR UPDATE`;
  const h = await tx.livestockHerd.findFirst({ where: { id: herdId, tenantId: actor.tenantId, companyId: actor.companyId }, include: { events: true, expenses: true } });
  if (!h) throw NotFound("القطيع");
  return { herd: h, summary: herdSummary(h.events, h.expenses) };
}

export async function createHerd(tx: Tx, actor: Actor, input: { name: string; species: string; breed?: string | null; location?: string | null; activityId?: string | null; shipmentId?: string | null; notes?: string | null }) {
  await assertActivity(tx, actor, input.activityId);
  if (input.shipmentId && !(await tx.importShipment.findFirst({ where: { id: input.shipmentId, tenantId: actor.tenantId, companyId: actor.companyId } }))) throw NotFound("الشحنة");
  const h = await tx.livestockHerd.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, ...input } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "LivestockHerd", entityId: h.id, data: { name: h.name } });
  return h;
}

export async function recordHerdPurchase(tx: Tx, actor: Actor, input: { herdId: string; date: Date; quantity: number; amount: DecimalLike; settlement: Settlement; note?: string | null }) {
  const { herd } = await loadHerd(tx, actor, input.herdId);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new ServiceError("العدد غير صالح");
  const acc = await systemAccounts(tx, actor.companyId, ["INV_LIVESTOCK"]);
  const desc = `شراء ${input.quantity} رأس - ${herd.name}`;
  const amount = money(input.amount);
  const entry = await createJournalEntry(tx, {
    tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date, description: desc, sourceType: "HERD_PURCHASE", sourceId: herd.id,
    lines: [{ accountId: acc("INV_LIVESTOCK"), debit: amount, activityId: herd.activityId }, await settlementLine(tx, actor, input.settlement, amount, desc)],
  });
  return tx.herdEvent.create({ data: { tenantId: actor.tenantId, herdId: herd.id, type: "PURCHASE", date: input.date, quantity: input.quantity, amount: toDb(amount), note: input.note ?? null, journalEntryId: entry.id } });
}

export async function recordHerdBirth(tx: Tx, actor: Actor, input: { herdId: string; date: Date; quantity: number; note?: string | null }) {
  const { herd } = await loadHerd(tx, actor, input.herdId);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new ServiceError("العدد غير صالح");
  return tx.herdEvent.create({ data: { tenantId: actor.tenantId, herdId: herd.id, type: "BIRTH", date: input.date, quantity: input.quantity, note: input.note ?? null } });
}

export async function recordHerdWeighing(tx: Tx, actor: Actor, input: { herdId: string; date: Date; quantity: number; avgWeightKg: DecimalLike; note?: string | null }) {
  const { herd } = await loadHerd(tx, actor, input.herdId);
  return tx.herdEvent.create({ data: { tenantId: actor.tenantId, herdId: herd.id, type: "WEIGHING", date: input.date, quantity: input.quantity, avgWeightKg: D(input.avgWeightKg).toFixed(2), note: input.note ?? null } });
}

/** Care cost (feed, vet, labor ...) capitalised into the herd valuation — counted once. */
export async function addHerdExpense(tx: Tx, actor: Actor, input: { herdId: string; category: string; description?: string | null; date: Date; settlement: Settlement } & CostEntry) {
  const { herd, summary } = await loadHerd(tx, actor, input.herdId);
  if (summary.remaining <= 0) throw new ServiceError("القطيع لا يحتوي على رؤوس؛ سجّل المصروف كمصروف عام");
  const acc = await systemAccounts(tx, actor.companyId, ["INV_LIVESTOCK"]);
  const desc = `${input.category} - ${herd.name}`;
  const entry = await createJournalEntry(tx, {
    tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date, description: desc, sourceType: "HERD_EXPENSE", sourceId: herd.id,
    lines: await capitaliseLines(tx, actor, acc("INV_LIVESTOCK"), input, input.settlement, herd.activityId, desc),
  });
  const e = await tx.livestockExpense.create({
    data: { tenantId: actor.tenantId, herdId: herd.id, category: input.category, description: input.description ?? null, amount: toDb(input.amount), vatAmount: toDb(input.vatAmount ?? 0), vatRecoverable: input.vatRecoverable !== false, date: input.date, journalEntryId: entry.id },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "LivestockExpense", entityId: e.id, data: { amount: e.amount.toString() } });
  return e;
}

export async function recordHerdDeath(tx: Tx, actor: Actor, input: { herdId: string; date: Date; quantity: number; note?: string | null }) {
  const { herd, summary } = await loadHerd(tx, actor, input.herdId);
  const cost = costOfRemoval(summary, input.quantity);
  const acc = await systemAccounts(tx, actor.companyId, ["INV_LIVESTOCK", "LIVESTOCK_MORTALITY"]);
  let entryId: string | null = null;
  if (cost.gt(0)) {
    const entry = await createJournalEntry(tx, {
      tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date, description: `نفوق ${input.quantity} رأس - ${herd.name}`, sourceType: "HERD_DEATH", sourceId: herd.id,
      lines: [{ accountId: acc("LIVESTOCK_MORTALITY"), debit: cost, activityId: herd.activityId }, { accountId: acc("INV_LIVESTOCK"), credit: cost, activityId: herd.activityId }],
    });
    entryId = entry.id;
  }
  const ev = await tx.herdEvent.create({ data: { tenantId: actor.tenantId, herdId: herd.id, type: "DEATH", date: input.date, quantity: input.quantity, costRemoved: toDb(cost), note: input.note ?? null, journalEntryId: entryId } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "death", entity: "LivestockHerd", entityId: herd.id, data: { quantity: input.quantity, cost: cost.toFixed(2) } });
  return ev;
}

export async function sellFromHerd(
  tx: Tx,
  actor: Actor,
  input: { herdId: string; customerId: string; date: Date; quantity: number; unitPrice: DecimalLike; vatRate: DecimalLike; paidNow?: { amount: DecimalLike; accountId: string } | null },
) {
  const { herd, summary } = await loadHerd(tx, actor, input.herdId);
  const cost = costOfRemoval(summary, input.quantity);
  const acc = await systemAccounts(tx, actor.companyId, ["INV_LIVESTOCK", "COGS_LIVESTOCK", "SALES_LIVESTOCK"]);
  const invoice = await createInvoice(tx, actor, {
    type: "SALES", issueDate: input.date, dueDate: input.date, customerId: input.customerId, activityId: herd.activityId,
    lines: [{ description: `${herd.species}${herd.breed ? ` - ${herd.breed}` : ""} (${herd.name})`, quantity: input.quantity, unitPrice: input.unitPrice, vatRate: input.vatRate, accountId: acc("SALES_LIVESTOCK") }],
  });
  const posted = await postInvoice(tx, actor, invoice.id);
  if (cost.gt(0)) {
    await createJournalEntry(tx, {
      tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date, description: `تكلفة بيع ${input.quantity} رأس - ${invoice.number}`, sourceType: "HERD_SALE", sourceId: herd.id,
      lines: [{ accountId: acc("COGS_LIVESTOCK"), debit: cost, activityId: herd.activityId }, { accountId: acc("INV_LIVESTOCK"), credit: cost, activityId: herd.activityId }],
    });
  }
  const revenue = money(D(posted.total).minus(posted.vatTotal));
  await tx.herdEvent.create({ data: { tenantId: actor.tenantId, herdId: herd.id, type: "SALE", date: input.date, quantity: input.quantity, amount: toDb(revenue), costRemoved: toDb(cost), note: invoice.number } });
  if (input.paidNow && D(input.paidNow.amount).gt(0)) {
    await recordPayment(tx, actor, { direction: "IN", method: "CASH", date: input.date, amount: input.paidNow.amount, accountId: input.paidNow.accountId, customerId: input.customerId, allocations: [{ invoiceId: invoice.id, amount: input.paidNow.amount }], reference: invoice.number });
  }
  return { invoice: posted, cost, profit: revenue.minus(cost) };
}
