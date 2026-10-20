import type { ActivityType, PlanCode, Role } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { seedChartOfAccounts } from "@/lib/accounting/chart";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { ServiceError } from "./actor";

export const PLAN_DEFAULTS: Record<PlanCode, { nameAr: string; nameEn: string; maxCompanies: number; maxUsers: number; features: string[]; price: string }> = {
  FREE: { nameAr: "مجاني", nameEn: "Free", maxCompanies: 1, maxUsers: 2, features: ["core"], price: "0" },
  STARTER: { nameAr: "المبتدئ", nameEn: "Starter", maxCompanies: 2, maxUsers: 5, features: ["core", "inventory", "invoices"], price: "199" },
  BUSINESS: { nameAr: "الأعمال", nameEn: "Business", maxCompanies: 5, maxUsers: 25, features: ["core", "inventory", "invoices", "accounting", "partners", "reports"], price: "599" },
  ENTERPRISE: { nameAr: "المؤسسات", nameEn: "Enterprise", maxCompanies: 50, maxUsers: 500, features: ["core", "inventory", "invoices", "accounting", "partners", "reports", "audit"], price: "1999" },
};

export async function ensurePlans(tx: Tx = db) {
  for (const [code, p] of Object.entries(PLAN_DEFAULTS) as [PlanCode, (typeof PLAN_DEFAULTS)[PlanCode]][]) {
    await tx.subscriptionPlan.upsert({
      where: { code },
      create: { code, nameAr: p.nameAr, nameEn: p.nameEn, maxCompanies: p.maxCompanies, maxUsers: p.maxUsers, features: p.features, monthlyPrice: p.price },
      update: {},
    });
  }
}

const slugify = (s: string) =>
  (s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tenant") + "-" + newToken().slice(0, 6).toLowerCase();

export async function createTenant(tx: Tx, input: { name: string; ownerUserId: string; plan?: PlanCode; actorUserId?: string }) {
  await ensurePlans(tx);
  const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { code: input.plan ?? "BUSINESS" } });
  const tenant = await tx.tenant.create({
    data: {
      name: input.name,
      slug: slugify(input.name),
      subscription: { create: { planId: plan.id, status: "ACTIVE" } },
      memberships: { create: { userId: input.ownerUserId, role: "TENANT_OWNER" } },
    },
  });
  await audit(tx, { tenantId: tenant.id, userId: input.actorUserId ?? input.ownerUserId, action: "create", entity: "Tenant", entityId: tenant.id, data: { name: input.name, plan: plan.code } });
  return tenant;
}

/** Creates the very first platform owner (super admin + tenant owner). */
export async function bootstrapPlatform(input: { email: string; name: string; password: string; tenantName: string }) {
  return db.$transaction(async (tx) => {
    if ((await tx.user.count()) > 0) throw new ServiceError("تم إعداد المنصة مسبقًا");
    const user = await tx.user.create({
      data: { email: input.email.toLowerCase(), name: input.name, passwordHash: await hashPassword(input.password), isSuperAdmin: true },
    });
    const tenant = await createTenant(tx, { name: input.tenantName, ownerUserId: user.id, plan: "ENTERPRISE" });
    return { user, tenant };
  });
}

export async function planLimits(tx: Tx, tenantId: string) {
  const sub = await tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
  if (!sub) throw new ServiceError("لا يوجد اشتراك لهذه المنشأة");
  const expired = sub.expiresAt && sub.expiresAt < new Date();
  const active = !expired && (sub.status === "ACTIVE" || sub.status === "TRIALING");
  return { sub, plan: sub.plan, active };
}

async function assertActiveSubscription(tx: Tx, tenantId: string) {
  const { active } = await planLimits(tx, tenantId);
  if (!active) throw new ServiceError("اشتراك المنشأة غير نشط أو منتهي. يرجى تجديد الاشتراك.");
}

export async function createCompany(
  tx: Tx,
  tenantId: string,
  userId: string,
  input: { name: string; legalName?: string | null; taxNumber?: string | null; crNumber?: string | null; baseCurrency: string; activities: { name: string; type: ActivityType }[] },
) {
  await assertActiveSubscription(tx, tenantId);
  const { plan } = await planLimits(tx, tenantId);
  const count = await tx.company.count({ where: { tenantId } });
  if (count >= plan.maxCompanies) throw new ServiceError(`باقة ${plan.nameAr} تسمح بـ ${plan.maxCompanies} شركة فقط. يرجى ترقية الباقة.`);
  const company = await tx.company.create({
    data: {
      tenantId,
      name: input.name,
      legalName: input.legalName,
      taxNumber: input.taxNumber,
      crNumber: input.crNumber,
      baseCurrency: input.baseCurrency,
      activities: { create: input.activities.map((a) => ({ name: a.name, type: a.type })) },
      warehouses: { create: [{ name: "المستودع الرئيسي" }] },
    },
  });
  await seedChartOfAccounts(tx, tenantId, company.id);
  const year = new Date().getUTCFullYear();
  await tx.financialPeriod.create({
    data: { tenantId, companyId: company.id, name: `السنة المالية ${year}`, startDate: new Date(Date.UTC(year, 0, 1)), endDate: new Date(Date.UTC(year, 11, 31)) },
  });
  await audit(tx, { tenantId, companyId: company.id, userId, action: "create", entity: "Company", entityId: company.id, data: { name: input.name } });
  return company;
}

export async function createInvitation(tx: Tx, tenantId: string, userId: string, input: { email: string; role: Role; companyIds: string[] }) {
  await assertActiveSubscription(tx, tenantId);
  const { plan } = await planLimits(tx, tenantId);
  const [members, pending] = await Promise.all([
    tx.membership.count({ where: { tenantId, isActive: true } }),
    tx.invitation.count({ where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  if (members + pending >= plan.maxUsers) throw new ServiceError(`باقة ${plan.nameAr} تسمح بـ ${plan.maxUsers} مستخدمين فقط`);
  if (input.companyIds.length) {
    const n = await tx.company.count({ where: { tenantId, id: { in: input.companyIds } } });
    if (n !== input.companyIds.length) throw new ServiceError("شركة غير صالحة");
  }
  const existing = await tx.user.findUnique({ where: { email: input.email.toLowerCase() }, include: { memberships: { where: { tenantId } } } });
  if (existing?.memberships.length) throw new ServiceError("هذا المستخدم عضو في المنشأة بالفعل");
  const token = newToken();
  const inv = await tx.invitation.create({
    data: {
      tenantId,
      email: input.email.toLowerCase(),
      role: input.role,
      companyIds: input.companyIds,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      createdById: userId,
    },
  });
  await audit(tx, { tenantId, userId, action: "invite", entity: "Invitation", entityId: inv.id, data: { email: inv.email, role: inv.role } });
  return { invitation: inv, token };
}

export async function acceptInvitation(token: string, input: { name: string; password: string }) {
  return db.$transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new ServiceError("رابط الدعوة غير صالح أو منتهي");
    let user = await tx.user.findUnique({ where: { email: inv.email } });
    if (!user) {
      user = await tx.user.create({ data: { email: inv.email, name: input.name, passwordHash: await hashPassword(input.password) } });
    }
    await tx.membership.create({ data: { tenantId: inv.tenantId, userId: user.id, role: inv.role, companyIds: inv.companyIds } });
    await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await audit(tx, { tenantId: inv.tenantId, userId: user.id, action: "accept", entity: "Invitation", entityId: inv.id });
    return { user, tenantId: inv.tenantId, existingUser: user.createdAt < inv.createdAt };
  });
}
