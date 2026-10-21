import type { Tx } from "@/lib/db";
import { D, money, sum, toDb, type DecimalLike } from "@/lib/money";
import { nextNumber } from "@/lib/sequence";

export interface LineInput {
  accountId: string;
  debit?: DecimalLike;
  credit?: DecimalLike;
  description?: string | null;
  activityId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  partnerId?: string | null;
  currency?: string;
  fxRate?: DecimalLike;
}

export class JournalError extends Error {}

/** Validates journal lines: non-negative, one side per line, balanced, non-zero. */
export function validateLines(lines: LineInput[]) {
  const clean = lines
    .map((l) => ({ ...l, debit: money(l.debit ?? 0), credit: money(l.credit ?? 0) }))
    .filter((l) => !l.debit.isZero() || !l.credit.isZero());
  if (clean.length < 2) throw new JournalError("القيد يحتاج سطرين على الأقل");
  for (const l of clean) {
    if (l.debit.isNegative() || l.credit.isNegative()) throw new JournalError("لا يسمح بمبالغ سالبة في القيد");
    if (!l.debit.isZero() && !l.credit.isZero()) throw new JournalError("السطر الواحد إما مدين أو دائن");
  }
  const debit = sum(clean.map((l) => l.debit));
  const credit = sum(clean.map((l) => l.credit));
  if (!debit.equals(credit)) throw new JournalError(`القيد غير متوازن: مدين ${debit.toFixed(2)} ≠ دائن ${credit.toFixed(2)}`);
  return { lines: clean, total: debit };
}

/** Merge lines that hit the same account/side/activity so auto-entries stay readable. */
export function compactLines(lines: LineInput[]): LineInput[] {
  const out = new Map<string, LineInput & { debit: DecimalLike; credit: DecimalLike }>();
  for (const l of lines) {
    const side = D(l.debit).isZero() ? "C" : "D";
    const k = [l.accountId, side, l.activityId, l.customerId, l.supplierId, l.partnerId, l.description, l.currency].map((x) => x ?? "").join("|");
    const prev = out.get(k);
    if (prev) {
      prev.debit = D(prev.debit).plus(D(l.debit));
      prev.credit = D(prev.credit).plus(D(l.credit));
    } else out.set(k, { ...l, debit: D(l.debit), credit: D(l.credit) });
  }
  return [...out.values()];
}

export interface JournalInput {
  tenantId: string;
  companyId: string;
  userId?: string | null;
  date: Date;
  description: string;
  lines: LineInput[];
  sourceType?: string;
  sourceId?: string;
  post?: boolean;
  reversalOfId?: string;
}

async function assertOpenPeriod(tx: Tx, companyId: string, date: Date) {
  const closed = await tx.financialPeriod.findFirst({
    where: { companyId, isClosed: true, startDate: { lte: date }, endDate: { gte: date } },
  });
  if (closed) throw new JournalError(`الفترة المالية "${closed.name}" مقفلة ولا يمكن الترحيل إليها`);
}

/**
 * Creates a journal entry. Posted entries are written as DRAFT first and then flipped
 * to POSTED so the database triggers can verify the balance and lock the lines.
 */
export async function createJournalEntry(tx: Tx, input: JournalInput) {
  const { lines } = validateLines(compactLines(input.lines));
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const accounts = await tx.account.findMany({
    where: { id: { in: accountIds }, companyId: input.companyId, tenantId: input.tenantId, isActive: true },
    select: { id: true },
  });
  if (accounts.length !== accountIds.length) throw new JournalError("حساب غير صالح لهذه الشركة");
  if (input.post !== false) await assertOpenPeriod(tx, input.companyId, input.date);

  const number = await nextNumber(tx, input.tenantId, input.companyId, "JE");
  const entry = await tx.journalEntry.create({
    data: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      number,
      date: input.date,
      description: input.description.slice(0, 500),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reversalOfId: input.reversalOfId,
      createdById: input.userId ?? null,
      status: "DRAFT",
      lines: {
        create: lines.map((l) => ({
          tenantId: input.tenantId,
          accountId: l.accountId,
          debit: toDb(l.debit),
          credit: toDb(l.credit),
          description: l.description ?? null,
          activityId: l.activityId ?? null,
          customerId: l.customerId ?? null,
          supplierId: l.supplierId ?? null,
          partnerId: l.partnerId ?? null,
          currency: l.currency ?? "SAR",
          fxRate: D(l.fxRate ?? 1).toFixed(6),
          fxAmount: D(l.fxRate ?? 1).isZero()
            ? "0"
            : toDb(D(l.debit).plus(l.credit).div(D(l.fxRate ?? 1))),
        })),
      },
    },
  });
  if (input.post === false) return entry;
  return tx.journalEntry.update({
    where: { id: entry.id },
    data: { status: "POSTED", postedAt: new Date(), postedById: input.userId ?? null },
  });
}

export async function postDraftEntry(tx: Tx, tenantId: string, entryId: string, userId: string) {
  const entry = await tx.journalEntry.findFirst({ where: { id: entryId, tenantId }, include: { lines: true } });
  if (!entry) throw new JournalError("القيد غير موجود");
  if (entry.status !== "DRAFT") throw new JournalError("القيد مرحل مسبقًا");
  validateLines(entry.lines);
  await assertOpenPeriod(tx, entry.companyId, entry.date);
  return tx.journalEntry.update({ where: { id: entry.id }, data: { status: "POSTED", postedAt: new Date(), postedById: userId } });
}

/** Reverses a posted entry with a mirror entry; the original is marked REVERSED. */
export async function reverseJournalEntry(tx: Tx, tenantId: string, entryId: string, userId: string, date?: Date) {
  const entry = await tx.journalEntry.findFirst({ where: { id: entryId, tenantId }, include: { lines: true, reversedBy: true } });
  if (!entry) throw new JournalError("القيد غير موجود");
  if (entry.status !== "POSTED") throw new JournalError("يمكن عكس القيود المرحلة فقط");
  if (entry.reversedBy) throw new JournalError("تم عكس هذا القيد مسبقًا");
  const reversal = await createJournalEntry(tx, {
    tenantId,
    companyId: entry.companyId,
    userId,
    date: date ?? new Date(),
    description: `عكس القيد ${entry.number}: ${entry.description}`,
    sourceType: "REVERSAL",
    sourceId: entry.id,
    reversalOfId: entry.id,
    lines: entry.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.credit,
      credit: l.debit,
      description: l.description,
      activityId: l.activityId,
      customerId: l.customerId,
      supplierId: l.supplierId,
      partnerId: l.partnerId,
      currency: l.currency,
      fxRate: l.fxRate,
    })),
  });
  await tx.journalEntry.update({ where: { id: entry.id }, data: { status: "REVERSED" } });
  return reversal;
}
