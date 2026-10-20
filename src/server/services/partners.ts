import type { PartnershipScope, PartnerTxnType } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { systemAccounts } from "@/lib/accounting/chart";
import { createJournalEntry } from "@/lib/accounting/journal";
import { distribute } from "@/lib/domain/partners";
import { D, money, toDb, type DecimalLike } from "@/lib/money";
import { NotFound, ServiceError, type Actor } from "./actor";
import { assertCashAccount } from "./invoices";

export async function createAgreement(
  tx: Tx,
  actor: Actor,
  input: { name: string; scope: PartnershipScope; scopeRefId?: string | null; notes?: string | null; shares: { partnerId: string; capitalAmount: DecimalLike; profitSharePct?: DecimalLike | null; lossSharePct?: DecimalLike | null }[] },
) {
  if (!input.shares.length) throw new ServiceError("أضف شريكًا واحدًا على الأقل");
  const ids = input.shares.map((s) => s.partnerId);
  if (new Set(ids).size !== ids.length) throw new ServiceError("شريك مكرر");
  const n = await tx.partner.count({ where: { tenantId: actor.tenantId, id: { in: ids } } });
  if (n !== ids.length) throw NotFound("الشريك");
  // Validates the ratios (sum to 100 / all-or-none) up front.
  distribute(input.shares, 100);
  if (input.scopeRefId) {
    const ok =
      input.scope === "ACTIVITY" ? await tx.businessActivity.findFirst({ where: { id: input.scopeRefId, companyId: actor.companyId, tenantId: actor.tenantId } })
      : input.scope === "SHIPMENT" ? await tx.importShipment.findFirst({ where: { id: input.scopeRefId, companyId: actor.companyId, tenantId: actor.tenantId } })
      : input.scope === "VEHICLE" ? await tx.vehicle.findFirst({ where: { id: input.scopeRefId, companyId: actor.companyId, tenantId: actor.tenantId } })
      : true;
    if (!ok) throw NotFound("نطاق الشراكة");
  }
  const a = await tx.partnershipAgreement.create({
    data: {
      tenantId: actor.tenantId, companyId: actor.companyId, name: input.name, scope: input.scope, scopeRefId: input.scopeRefId ?? null, notes: input.notes ?? null,
      shares: { create: input.shares.map((s) => ({ tenantId: actor.tenantId, partnerId: s.partnerId, capitalAmount: toDb(s.capitalAmount), profitSharePct: s.profitSharePct ? D(s.profitSharePct).toFixed(4) : null, lossSharePct: s.lossSharePct ? D(s.lossSharePct).toFixed(4) : null })) },
    },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "PartnershipAgreement", entityId: a.id, data: { name: a.name } });
  return a;
}

async function getAgreement(tx: Tx, actor: Actor, id: string) {
  const a = await tx.partnershipAgreement.findFirst({ where: { id, tenantId: actor.tenantId, companyId: actor.companyId }, include: { shares: true } });
  if (!a) throw NotFound("الاتفاقية");
  return a;
}

/** Capital contribution or withdrawal; posts cash against the partner's current account. */
export async function recordPartnerMovement(
  tx: Tx,
  actor: Actor,
  input: { agreementId: string; partnerId: string; type: Extract<PartnerTxnType, "CONTRIBUTION" | "WITHDRAWAL">; amount: DecimalLike; date: Date; accountId: string; note?: string | null },
) {
  const a = await getAgreement(tx, actor, input.agreementId);
  if (!a.shares.some((s) => s.partnerId === input.partnerId)) throw new ServiceError("الشريك ليس طرفًا في هذه الاتفاقية");
  const amount = money(input.amount);
  if (!amount.gt(0)) throw new ServiceError("المبلغ يجب أن يكون أكبر من صفر");
  await assertCashAccount(tx, actor, input.accountId);
  const acc = await systemAccounts(tx, actor.companyId, ["CAPITAL", "PARTNER_CURRENT"]);
  const equity = input.type === "CONTRIBUTION" && a.scope === "COMPANY" ? acc("CAPITAL") : acc("PARTNER_CURRENT");
  const entry = await createJournalEntry(tx, {
    tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date, sourceType: "PARTNER", sourceId: a.id,
    description: `${input.type === "CONTRIBUTION" ? "مساهمة رأس مال" : "سحب"} - ${a.name}`,
    lines: input.type === "CONTRIBUTION"
      ? [{ accountId: input.accountId, debit: amount }, { accountId: equity, credit: amount, partnerId: input.partnerId }]
      : [{ accountId: acc("PARTNER_CURRENT"), debit: amount, partnerId: input.partnerId }, { accountId: input.accountId, credit: amount }],
  });
  return tx.partnerTransaction.create({ data: { tenantId: actor.tenantId, agreementId: a.id, partnerId: input.partnerId, type: input.type, amount: toDb(amount), date: input.date, note: input.note ?? null, journalEntryId: entry.id } });
}

/**
 * Distributes a profit (or allocates a loss) between the agreement's partners using the
 * agreed ratios. When `post` is true the amount moves from retained earnings to the
 * partners' current accounts.
 */
export async function distributeProfit(tx: Tx, actor: Actor, input: { agreementId: string; amount: DecimalLike; date: Date; post: boolean; note?: string | null }) {
  const a = await getAgreement(tx, actor, input.agreementId);
  const amount = money(input.amount);
  if (amount.isZero()) throw new ServiceError("المبلغ لا يمكن أن يكون صفرًا");
  const parts = distribute(a.shares, amount);
  let entryId: string | null = null;
  if (input.post) {
    const acc = await systemAccounts(tx, actor.companyId, ["RETAINED_EARNINGS", "PARTNER_CURRENT"]);
    const lines = amount.gt(0)
      ? [{ accountId: acc("RETAINED_EARNINGS"), debit: amount }, ...parts.map((p) => ({ accountId: acc("PARTNER_CURRENT"), credit: p.amount, partnerId: p.partnerId }))]
      : [{ accountId: acc("RETAINED_EARNINGS"), credit: amount.neg() }, ...parts.map((p) => ({ accountId: acc("PARTNER_CURRENT"), debit: p.amount.neg(), partnerId: p.partnerId }))];
    const e = await createJournalEntry(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, date: input.date, description: `${amount.gt(0) ? "توزيع أرباح" : "تحميل خسائر"} - ${a.name}`, sourceType: "PARTNER", sourceId: a.id, lines });
    entryId = e.id;
  }
  for (const p of parts) {
    await tx.partnerTransaction.create({
      data: { tenantId: actor.tenantId, agreementId: a.id, partnerId: p.partnerId, type: amount.gt(0) ? "PROFIT_DISTRIBUTION" : "LOSS_ALLOCATION", amount: toDb(p.amount.abs()), date: input.date, note: input.note ?? null, journalEntryId: entryId },
    });
  }
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "distribute", entity: "PartnershipAgreement", entityId: a.id, data: { amount: amount.toFixed(2), parts: parts.map((p) => ({ partnerId: p.partnerId, amount: p.amount.toFixed(2) })) } });
  return parts;
}
