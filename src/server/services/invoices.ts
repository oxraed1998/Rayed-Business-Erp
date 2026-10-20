import { randomUUID } from "node:crypto";
import type { InvoiceType, PaymentMethod } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ACTIVITY_ACCOUNTS, systemAccounts, type SystemKey } from "@/lib/accounting/chart";
import { createJournalEntry, reverseJournalEntry, type LineInput } from "@/lib/accounting/journal";
import { calcInvoice, type InvoiceLineInput } from "@/lib/domain/invoice-calc";
import { allocateToInstallments, buildSchedule } from "@/lib/domain/installments";
import { D, money, toDb, type DecimalLike } from "@/lib/money";
import { nextNumber } from "@/lib/sequence";
import { NotFound, ServiceError, type Actor } from "./actor";

export interface InvoiceInput {
  type: InvoiceType;
  issueDate: Date;
  dueDate?: Date | null;
  customerId?: string | null;
  supplierId?: string | null;
  activityId?: string | null;
  relatedInvoiceId?: string | null;
  currency?: string;
  fxRate?: DecimalLike;
  notes?: string | null;
  lines: (InvoiceLineInput & { accountId?: string | null })[];
}

const isCustomerSide = (t: InvoiceType) => t !== "PURCHASE";

export async function assertActivity(tx: Tx, actor: Actor, activityId: string | null | undefined) {
  if (!activityId) return null;
  const a = await tx.businessActivity.findFirst({ where: { id: activityId, tenantId: actor.tenantId, companyId: actor.companyId } });
  if (!a) throw NotFound("النشاط");
  return a;
}

export async function assertCashAccount(tx: Tx, actor: Actor, accountId: string) {
  const a = await tx.account.findFirst({ where: { id: accountId, tenantId: actor.tenantId, companyId: actor.companyId, isCashLike: true, isActive: true } });
  if (!a) throw new ServiceError("حساب الصندوق/البنك غير صالح");
  return a;
}

/**
 * "Settlement" account for purchases/expenses: a cash/bank account, or "AP" (on credit,
 * requires a supplier so the payable lands on the supplier's statement).
 */
export async function settlementLine(
  tx: Tx,
  actor: Actor,
  settlement: { accountId: string | "AP"; supplierId?: string | null },
  amount: DecimalLike,
  description?: string,
): Promise<LineInput> {
  if (settlement.accountId === "AP") {
    if (!settlement.supplierId) throw new ServiceError("الشراء الآجل يتطلب تحديد المورد");
    const s = await tx.supplier.findFirst({ where: { id: settlement.supplierId, tenantId: actor.tenantId, companyId: actor.companyId } });
    if (!s) throw NotFound("المورد");
    const acc = await systemAccounts(tx, actor.companyId, ["AP"]);
    return { accountId: acc("AP"), credit: amount, supplierId: s.id, description };
  }
  await assertCashAccount(tx, actor, settlement.accountId);
  return { accountId: settlement.accountId, credit: amount, description };
}

async function assertParty(tx: Tx, actor: Actor, input: Pick<InvoiceInput, "type" | "customerId" | "supplierId">) {
  if (isCustomerSide(input.type)) {
    if (!input.customerId) throw new ServiceError("يجب اختيار العميل");
    const c = await tx.customer.findFirst({ where: { id: input.customerId, tenantId: actor.tenantId, companyId: actor.companyId } });
    if (!c) throw NotFound("العميل");
  } else {
    if (!input.supplierId) throw new ServiceError("يجب اختيار المورد");
    const s = await tx.supplier.findFirst({ where: { id: input.supplierId, tenantId: actor.tenantId, companyId: actor.companyId } });
    if (!s) throw NotFound("المورد");
  }
}

export async function createInvoice(tx: Tx, actor: Actor, input: InvoiceInput) {
  await assertParty(tx, actor, input);
  const activity = await assertActivity(tx, actor, input.activityId);
  if (input.relatedInvoiceId) {
    const rel = await tx.invoice.findFirst({ where: { id: input.relatedInvoiceId, tenantId: actor.tenantId, companyId: actor.companyId, status: "POSTED" } });
    if (!rel) throw NotFound("الفاتورة الأصلية");
  }
  const lineAccounts = [...new Set(input.lines.map((l) => l.accountId).filter(Boolean))] as string[];
  if (lineAccounts.length) {
    const n = await tx.account.count({ where: { id: { in: lineAccounts }, tenantId: actor.tenantId, companyId: actor.companyId } });
    if (n !== lineAccounts.length) throw new ServiceError("حساب غير صالح في بنود الفاتورة");
  }
  const calc = calcInvoice(input.lines);
  const number = await nextNumber(tx, actor.tenantId, actor.companyId, `INV_${input.type}`);
  const invoice = await tx.invoice.create({
    data: {
      tenantId: actor.tenantId,
      companyId: actor.companyId,
      activityId: activity?.id ?? null,
      type: input.type,
      number,
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? null,
      customerId: isCustomerSide(input.type) ? input.customerId : null,
      supplierId: isCustomerSide(input.type) ? null : input.supplierId,
      relatedInvoiceId: input.relatedInvoiceId ?? null,
      currency: input.currency ?? "SAR",
      fxRate: D(input.fxRate ?? 1).toFixed(6),
      subtotal: toDb(calc.subtotal),
      discountTotal: toDb(calc.discountTotal),
      vatTotal: toDb(calc.vatTotal),
      total: toDb(calc.total),
      notes: input.notes ?? null,
      createdById: actor.userId,
      lines: {
        create: input.lines.map((l, i) => ({
          tenantId: actor.tenantId,
          description: l.description,
          quantity: D(l.quantity).toFixed(3),
          unitPrice: toDb(l.unitPrice),
          discount: toDb(calc.lines[i].discount),
          vatRate: calc.lines[i].rate.toFixed(2),
          lineNet: toDb(calc.lines[i].net),
          lineVat: toDb(calc.lines[i].vat),
          lineTotal: toDb(calc.lines[i].total),
          accountId: l.accountId ?? null,
          sortOrder: i,
        })),
      },
    },
    include: { lines: true },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "Invoice", entityId: invoice.id, data: { number, type: input.type, total: invoice.total.toString() } });
  return invoice;
}

/** Posts a draft invoice to the ledger. Amounts are converted to base currency with the invoice rate. */
export async function postInvoice(tx: Tx, actor: Actor, invoiceId: string) {
  const inv = await tx.invoice.findFirst({
    where: { id: invoiceId, tenantId: actor.tenantId, companyId: actor.companyId },
    include: { lines: true },
  });
  if (!inv) throw NotFound("الفاتورة");
  if (inv.status !== "DRAFT") throw new ServiceError("الفاتورة مرحلة مسبقًا");
  const activity = inv.activityId ? await tx.businessActivity.findUnique({ where: { id: inv.activityId } }) : null;
  const defaults = ACTIVITY_ACCOUNTS[activity?.type ?? "GENERAL"];
  const acc = await systemAccounts(tx, actor.companyId, ["AR", "AP", "VAT_OUTPUT", "VAT_INPUT", "CUSTOMER_ADVANCES", "GENERAL_EXPENSES", defaults.sales as SystemKey]);
  const rate = D(inv.fxRate);
  const base = (v: DecimalLike) => money(D(v).times(rate));
  const fx = { currency: inv.currency, fxRate: inv.fxRate, activityId: inv.activityId };

  // Convert each line to base and make the total the exact sum so the entry balances.
  const nets = inv.lines.map((l) => ({ accountId: l.accountId, net: base(l.lineNet) }));
  const vat = base(inv.vatTotal);
  const total = nets.reduce((a, n) => a.plus(n.net), D(0)).plus(vat);

  const revenueAccount = inv.type === "ADVANCE" ? acc("CUSTOMER_ADVANCES") : acc(defaults.sales as SystemKey);
  let lines: LineInput[];
  switch (inv.type) {
    case "SALES":
    case "DEBIT_NOTE":
    case "ADVANCE":
      lines = [
        { accountId: acc("AR"), debit: total, customerId: inv.customerId, ...fx },
        ...nets.map((n) => ({ accountId: n.accountId ?? revenueAccount, credit: n.net, ...fx })),
        { accountId: acc("VAT_OUTPUT"), credit: vat, ...fx },
      ];
      break;
    case "CREDIT_NOTE":
      lines = [
        { accountId: acc("AR"), credit: total, customerId: inv.customerId, ...fx },
        ...nets.map((n) => ({ accountId: n.accountId ?? revenueAccount, debit: n.net, ...fx })),
        { accountId: acc("VAT_OUTPUT"), debit: vat, ...fx },
      ];
      break;
    case "PURCHASE":
      lines = [
        { accountId: acc("AP"), credit: total, supplierId: inv.supplierId, ...fx },
        ...nets.map((n) => ({ accountId: n.accountId ?? acc("GENERAL_EXPENSES"), debit: n.net, ...fx })),
        { accountId: acc("VAT_INPUT"), debit: vat, ...fx },
      ];
      break;
  }
  const entry = await createJournalEntry(tx, {
    tenantId: actor.tenantId,
    companyId: actor.companyId,
    userId: actor.userId,
    date: inv.issueDate,
    description: `${inv.number}`,
    sourceType: "INVOICE",
    sourceId: inv.id,
    lines,
  });
  const posted = await tx.invoice.update({ where: { id: inv.id }, data: { status: "POSTED", postedAt: new Date(), journalEntryId: entry.id } });
  // A credit note reduces what the customer owes on the original invoice.
  if (inv.type === "CREDIT_NOTE" && inv.relatedInvoiceId) {
    const rel = await tx.invoice.findUniqueOrThrow({ where: { id: inv.relatedInvoiceId } });
    const open = D(rel.total).minus(rel.amountPaid);
    const apply = money(D(inv.total).lessThan(open) ? inv.total : open);
    if (apply.gt(0)) {
      await tx.invoice.update({ where: { id: rel.id }, data: { amountPaid: toDb(D(rel.amountPaid).plus(apply)) } });
      await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: toDb(apply) } });
    }
  }
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "post", entity: "Invoice", entityId: inv.id, data: { journal: entry.number } });
  return posted;
}

/** Voids a posted invoice with a reversal entry. Not allowed once payments are allocated. */
export async function voidInvoice(tx: Tx, actor: Actor, invoiceId: string) {
  const inv = await tx.invoice.findFirst({ where: { id: invoiceId, tenantId: actor.tenantId, companyId: actor.companyId }, include: { allocations: true } });
  if (!inv) throw NotFound("الفاتورة");
  if (inv.status === "VOID") throw new ServiceError("الفاتورة ملغاة مسبقًا");
  if (inv.allocations.length) throw new ServiceError("لا يمكن إلغاء فاتورة عليها دفعات. اعكس الدفعات أولًا أو أصدر إشعارًا دائنًا.");
  if (inv.status === "POSTED" && inv.journalEntryId) await reverseJournalEntry(tx, actor.tenantId, inv.journalEntryId, actor.userId);
  await tx.invoice.update({ where: { id: inv.id }, data: { status: "VOID" } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "void", entity: "Invoice", entityId: inv.id });
}

export async function createInstallmentPlan(tx: Tx, actor: Actor, input: { invoiceId: string; downPayment: DecimalLike; count: number; firstDueDate: Date }) {
  const inv = await tx.invoice.findFirst({ where: { id: input.invoiceId, tenantId: actor.tenantId, companyId: actor.companyId }, include: { installmentPlan: true } });
  if (!inv) throw NotFound("الفاتورة");
  if (inv.type !== "SALES" || inv.status !== "POSTED") throw new ServiceError("التقسيط متاح لفواتير المبيعات المرحلة فقط");
  if (inv.installmentPlan) throw new ServiceError("للفاتورة خطة تقسيط بالفعل");
  const open = D(inv.total).minus(inv.amountPaid);
  const schedule = buildSchedule(open, input.downPayment, input.count, input.firstDueDate);
  const plan = await tx.installmentPlan.create({
    data: {
      tenantId: actor.tenantId,
      companyId: actor.companyId,
      invoiceId: inv.id,
      customerId: inv.customerId,
      totalAmount: toDb(open),
      downPayment: toDb(input.downPayment),
      count: input.count,
      firstDueDate: input.firstDueDate,
      installments: {
        create: [
          ...(D(input.downPayment).gt(0) ? [{ tenantId: actor.tenantId, seq: 0, dueDate: inv.issueDate, amount: toDb(input.downPayment) }] : []),
          ...schedule.map((s) => ({ tenantId: actor.tenantId, seq: s.seq, dueDate: s.dueDate, amount: toDb(s.amount) })),
        ],
      },
    },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "InstallmentPlan", entityId: plan.id, data: { invoice: inv.number, count: input.count } });
  return plan;
}

export interface PaymentInput {
  direction: "IN" | "OUT";
  method: PaymentMethod;
  date: Date;
  amount: DecimalLike;
  accountId: string;
  customerId?: string | null;
  supplierId?: string | null;
  isRefund?: boolean;
  reference?: string | null;
  notes?: string | null;
  /** Invoice allocations; omitted = allocate oldest open invoices first. */
  allocations?: { invoiceId: string; amount: DecimalLike }[];
  autoAllocate?: boolean;
}

/**
 * Receipt (IN, from customer) or payment (OUT, to supplier) voucher.
 * Refunds flip the direction of money but settle the same sub-ledger.
 */
export async function recordPayment(tx: Tx, actor: Actor, input: PaymentInput) {
  const amount = money(input.amount);
  if (!amount.gt(0)) throw new ServiceError("المبلغ يجب أن يكون أكبر من صفر");
  const cash = await assertCashAccount(tx, actor, input.accountId);
  const customerSide = input.direction === "IN" ? !input.isRefund : Boolean(input.isRefund);
  if (customerSide && !input.customerId) throw new ServiceError("يجب اختيار العميل");
  if (!customerSide && !input.supplierId) throw new ServiceError("يجب اختيار المورد");
  if (customerSide) {
    if (!(await tx.customer.findFirst({ where: { id: input.customerId!, tenantId: actor.tenantId, companyId: actor.companyId } }))) throw NotFound("العميل");
  } else if (!(await tx.supplier.findFirst({ where: { id: input.supplierId!, tenantId: actor.tenantId, companyId: actor.companyId } }))) throw NotFound("المورد");

  const acc = await systemAccounts(tx, actor.companyId, ["AR", "AP"]);
  const party = customerSide ? { accountId: acc("AR"), customerId: input.customerId } : { accountId: acc("AP"), supplierId: input.supplierId };
  const moneyIn = input.direction === "IN";
  const number = await nextNumber(tx, actor.tenantId, actor.companyId, moneyIn ? "PAY_IN" : "PAY_OUT");
  const paymentId = randomUUID();

  const entry = await createJournalEntry(tx, {
    tenantId: actor.tenantId,
    companyId: actor.companyId,
    userId: actor.userId,
    date: input.date,
    description: `${number}${input.reference ? ` - ${input.reference}` : ""}`,
    sourceType: "PAYMENT",
    sourceId: paymentId,
    lines: [
      { accountId: cash.id, ...(moneyIn ? { debit: amount } : { credit: amount }) },
      { ...party, ...(moneyIn ? { credit: amount } : { debit: amount }) },
    ],
  });

  const payment = await tx.payment.create({
    data: {
      id: paymentId,
      tenantId: actor.tenantId,
      companyId: actor.companyId,
      number,
      direction: input.direction,
      method: input.method,
      date: input.date,
      amount: toDb(amount),
      accountId: cash.id,
      customerId: customerSide ? input.customerId : null,
      supplierId: customerSide ? null : input.supplierId,
      isRefund: Boolean(input.isRefund),
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      journalEntryId: entry.id,
      createdById: actor.userId,
    },
  });

  if (!input.isRefund) await allocatePayment(tx, actor, payment.id, amount, customerSide, input);
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "Payment", entityId: payment.id, data: { number, amount: amount.toFixed(2), direction: input.direction } });
  return payment;
}

async function allocatePayment(tx: Tx, actor: Actor, paymentId: string, amount: ReturnType<typeof money>, customerSide: boolean, input: PaymentInput) {
  const partyWhere = customerSide ? { customerId: input.customerId!, type: { in: ["SALES", "DEBIT_NOTE", "ADVANCE"] as InvoiceType[] } } : { supplierId: input.supplierId!, type: "PURCHASE" as InvoiceType };
  let targets: { invoiceId: string; amount: ReturnType<typeof money> }[] = [];
  if (input.allocations?.length) {
    targets = input.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: money(a.amount) }));
  } else if (input.autoAllocate !== false) {
    const open = await tx.invoice.findMany({
      where: { tenantId: actor.tenantId, companyId: actor.companyId, status: "POSTED", ...partyWhere },
      orderBy: [{ dueDate: "asc" }, { issueDate: "asc" }],
    });
    let left = amount;
    for (const inv of open) {
      const due = D(inv.total).minus(inv.amountPaid);
      if (!due.gt(0) || !left.gt(0)) continue;
      const take = due.lessThan(left) ? due : left;
      targets.push({ invoiceId: inv.id, amount: money(take) });
      left = left.minus(take);
    }
  }
  const totalAlloc = targets.reduce((a, t) => a.plus(t.amount), D(0));
  if (totalAlloc.greaterThan(amount)) throw new ServiceError("مجموع التخصيص أكبر من مبلغ الدفعة");

  for (const t of targets) {
    if (!t.amount.gt(0)) continue;
    const inv = await tx.invoice.findFirst({
      where: { id: t.invoiceId, tenantId: actor.tenantId, companyId: actor.companyId, status: "POSTED", ...partyWhere },
      include: { installmentPlan: { include: { installments: { orderBy: { seq: "asc" } } } } },
    });
    if (!inv) throw NotFound("الفاتورة المخصص لها");
    const due = D(inv.total).minus(inv.amountPaid);
    if (t.amount.greaterThan(due)) throw new ServiceError(`المبلغ المخصص للفاتورة ${inv.number} أكبر من المتبقي (${due.toFixed(2)})`);
    await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: toDb(D(inv.amountPaid).plus(t.amount)) } });
    if (inv.installmentPlan) {
      const { applied } = allocateToInstallments(inv.installmentPlan.installments, t.amount);
      for (const a of applied) {
        const ins = inv.installmentPlan.installments.find((i) => i.id === a.id)!;
        await tx.installment.update({ where: { id: a.id }, data: { paidAmount: toDb(D(ins.paidAmount).plus(a.amount)) } });
        await tx.paymentAllocation.create({ data: { tenantId: actor.tenantId, paymentId, invoiceId: inv.id, installmentId: a.id, amount: toDb(a.amount) } });
      }
    } else {
      await tx.paymentAllocation.create({ data: { tenantId: actor.tenantId, paymentId, invoiceId: inv.id, amount: toDb(t.amount) } });
    }
  }
}
