import type { AccountType } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { systemAccounts } from "@/lib/accounting/chart";
import { createJournalEntry, postDraftEntry, reverseJournalEntry, type LineInput } from "@/lib/accounting/journal";
import { D, money } from "@/lib/money";
import { NotFound, ServiceError, type Actor } from "./actor";

export async function createAccount(tx: Tx, actor: Actor, input: { code: string; name: string; type: AccountType; isCashLike?: boolean; bankName?: string | null; iban?: string | null; parentId?: string | null }) {
  if (await tx.account.findFirst({ where: { companyId: actor.companyId, code: input.code } })) throw new ServiceError("رمز الحساب مستخدم");
  if (input.isCashLike && input.type !== "ASSET") throw new ServiceError("حسابات الصندوق والبنك يجب أن تكون من نوع أصول");
  if (input.parentId && !(await tx.account.findFirst({ where: { id: input.parentId, companyId: actor.companyId, tenantId: actor.tenantId } }))) throw NotFound("الحساب الأب");
  const a = await tx.account.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, ...input, isCashLike: Boolean(input.isCashLike) } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "Account", entityId: a.id, data: { code: a.code, name: a.name } });
  return a;
}

async function assertParties(tx: Tx, actor: Actor, lines: LineInput[]) {
  for (const l of lines) {
    if (l.customerId && !(await tx.customer.findFirst({ where: { id: l.customerId, tenantId: actor.tenantId, companyId: actor.companyId } }))) throw NotFound("العميل");
    if (l.supplierId && !(await tx.supplier.findFirst({ where: { id: l.supplierId, tenantId: actor.tenantId, companyId: actor.companyId } }))) throw NotFound("المورد");
    if (l.activityId && !(await tx.businessActivity.findFirst({ where: { id: l.activityId, tenantId: actor.tenantId, companyId: actor.companyId } }))) throw NotFound("النشاط");
  }
}

export async function createManualEntry(tx: Tx, actor: Actor, input: { date: Date; description: string; lines: LineInput[]; post: boolean }) {
  await assertParties(tx, actor, input.lines);
  const e = await createJournalEntry(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date, description: input.description, lines: input.lines, post: input.post, sourceType: "MANUAL" });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: input.post ? "post" : "create", entity: "JournalEntry", entityId: e.id, data: { number: e.number } });
  return e;
}

export async function postEntry(tx: Tx, actor: Actor, entryId: string) {
  const e = await tx.journalEntry.findFirst({ where: { id: entryId, tenantId: actor.tenantId, companyId: actor.companyId } });
  if (!e) throw NotFound("القيد");
  const r = await postDraftEntry(tx, actor.tenantId, e.id, actor.userId);
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "post", entity: "JournalEntry", entityId: e.id, data: { number: e.number } });
  return r;
}

export async function deleteDraftEntry(tx: Tx, actor: Actor, entryId: string) {
  const e = await tx.journalEntry.findFirst({ where: { id: entryId, tenantId: actor.tenantId, companyId: actor.companyId } });
  if (!e) throw NotFound("القيد");
  if (e.status !== "DRAFT") throw new ServiceError("لا يمكن حذف قيد مرحل؛ استخدم القيد العكسي");
  await tx.journalEntry.delete({ where: { id: e.id } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "delete", entity: "JournalEntry", entityId: e.id, data: { number: e.number } });
}

export async function reverseEntry(tx: Tx, actor: Actor, entryId: string, date: Date) {
  const e = await tx.journalEntry.findFirst({ where: { id: entryId, tenantId: actor.tenantId, companyId: actor.companyId } });
  if (!e) throw NotFound("القيد");
  if (e.sourceType && !["MANUAL", "PARTNER"].includes(e.sourceType)) {
    throw new ServiceError("هذا قيد آلي مرتبط بمستند؛ ألغِ المستند الأصلي (فاتورة/دفعة) بدل عكس القيد مباشرة");
  }
  const r = await reverseJournalEntry(tx, actor.tenantId, e.id, actor.userId, date);
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "reverse", entity: "JournalEntry", entityId: e.id, data: { reversal: r.number } });
  return r;
}

export async function createPeriod(tx: Tx, actor: Actor, input: { name: string; startDate: Date; endDate: Date }) {
  if (input.endDate < input.startDate) throw new ServiceError("تاريخ النهاية قبل البداية");
  const overlap = await tx.financialPeriod.findFirst({ where: { companyId: actor.companyId, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } } });
  if (overlap) throw new ServiceError(`الفترة تتداخل مع "${overlap.name}"`);
  return tx.financialPeriod.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, ...input } });
}

/**
 * Closes a period: posts a closing entry that zeroes revenue/expense accounts for the
 * period into retained earnings, then locks the period against further postings.
 */
export async function closePeriod(tx: Tx, actor: Actor, periodId: string) {
  const p = await tx.financialPeriod.findFirst({ where: { id: periodId, tenantId: actor.tenantId, companyId: actor.companyId } });
  if (!p) throw NotFound("الفترة");
  if (p.isClosed) throw new ServiceError("الفترة مقفلة مسبقًا");
  const drafts = await tx.journalEntry.count({ where: { companyId: actor.companyId, status: "DRAFT", date: { gte: p.startDate, lte: p.endDate } } });
  if (drafts) throw new ServiceError(`يوجد ${drafts} قيد مسودة في الفترة؛ رحّلها أو احذفها قبل الإقفال`);
  const grouped = await tx.journalLine.groupBy({
    by: ["accountId"],
    where: { tenantId: actor.tenantId, entry: { companyId: actor.companyId, status: { in: ["POSTED", "REVERSED"] }, date: { gte: p.startDate, lte: p.endDate } }, account: { type: { in: ["REVENUE", "EXPENSE"] } } },
    _sum: { debit: true, credit: true },
  });
  const acc = await systemAccounts(tx, actor.companyId, ["RETAINED_EARNINGS"]);
  const lines: LineInput[] = [];
  let net = D(0); // credit-positive profit
  for (const g of grouped) {
    const bal = money(D(g._sum.debit ?? 0).minus(D(g._sum.credit ?? 0)));
    if (bal.isZero()) continue;
    // Zero the account: credit a debit balance, debit a credit balance.
    lines.push(bal.gt(0) ? { accountId: g.accountId, credit: bal } : { accountId: g.accountId, debit: bal.neg() });
    net = net.minus(bal);
  }
  let entryNumber: string | null = null;
  if (lines.length) {
    lines.push(net.gt(0) ? { accountId: acc("RETAINED_EARNINGS"), credit: net } : { accountId: acc("RETAINED_EARNINGS"), debit: net.neg() });
    const e = await createJournalEntry(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: p.endDate, description: `قيد إقفال ${p.name}`, sourceType: "PERIOD_CLOSE", sourceId: p.id, lines });
    entryNumber = e.number;
  }
  await tx.financialPeriod.update({ where: { id: p.id }, data: { isClosed: true, closedAt: new Date(), closedById: actor.userId } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "close", entity: "FinancialPeriod", entityId: p.id, data: { name: p.name, netProfit: net.toFixed(2), entry: entryNumber } });
  return { net, entryNumber };
}
