import { db } from "@/lib/db";
import { systemAccounts } from "@/lib/accounting/chart";
import { accountBalances, trialBalance } from "@/lib/accounting/reports";
import { hashPassword } from "@/lib/auth/password";
import { createCompany, createTenant } from "@/server/services/tenancy";
import type { Actor } from "@/server/services/actor";

let n = 0;
export async function makeTenant(label: string) {
  n++;
  const user = await db.user.create({ data: { email: `${label}-${n}-${Date.now()}@test.local`, name: label, passwordHash: await hashPassword("Password1234") } });
  return db.$transaction(async (tx) => {
    const tenant = await createTenant(tx, { name: `Tenant ${label}`, ownerUserId: user.id, plan: "ENTERPRISE" });
    const company = await createCompany(tx, tenant.id, user.id, {
      name: `Company ${label}`, baseCurrency: "SAR",
      activities: [{ name: "السيارات", type: "VEHICLES" }, { name: "المواشي", type: "LIVESTOCK" }, { name: "الملابس", type: "CLOTHING" }],
    });
    const activities = await tx.businessActivity.findMany({ where: { companyId: company.id } });
    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { companyId: company.id } });
    const acc = await systemAccounts(tx, company.id, ["CASH", "BANK", "AR", "AP", "VAT_INPUT", "VAT_OUTPUT", "INV_VEHICLES", "INV_LIVESTOCK", "INV_CLOTHING", "GOODS_IN_TRANSIT", "COGS_VEHICLES", "SALES_VEHICLES", "RETAINED_EARNINGS", "PARTNER_CURRENT", "CAPITAL"]);
    const actor: Actor = { tenantId: tenant.id, companyId: company.id, userId: user.id };
    const act = (t: string) => activities.find((a) => a.type === t)!.id;
    return { user, tenant, company, actor, acc, warehouse, act };
  });
}

export async function balanceOf(actor: Actor, accountId: string) {
  const rows = await accountBalances({ tenantId: actor.tenantId, companyId: actor.companyId });
  return rows.find((r) => r.account.id === accountId)!.balance.toFixed(2);
}

export async function assertBalanced(actor: Actor) {
  const tb = trialBalance(await accountBalances({ tenantId: actor.tenantId, companyId: actor.companyId }));
  if (!tb.balanced) throw new Error(`Trial balance not balanced ${tb.totalDebit} vs ${tb.totalCredit}`);
  return tb;
}

export const tx = <T>(fn: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(fn, { timeout: 30000 });
