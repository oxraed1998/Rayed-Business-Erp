import type { PlanCode } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { ensurePlans } from "./tenancy";
import { ServiceError } from "./actor";

const slugify = (s: string) =>
  (s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tenant") + "-" + newToken().slice(0, 6).toLowerCase();

/**
 * Platform-admin onboarding of a new SaaS customer: creates the tenant and its subscription
 * and an owner invitation. The admin is NOT added as a member, so they get no access to the
 * tenant's business data.
 */
export async function createTenantWithOwnerInvite(tx: Tx, input: { name: string; ownerEmail: string; plan: PlanCode; adminUserId: string }) {
  await ensurePlans(tx);
  const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { code: input.plan } });
  const email = input.ownerEmail.toLowerCase();
  const tenant = await tx.tenant.create({
    data: { name: input.name, slug: slugify(input.name), subscription: { create: { planId: plan.id, status: "ACTIVE" } } },
  });
  const token = newToken();
  await tx.invitation.create({
    data: { tenantId: tenant.id, email, role: "TENANT_OWNER", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000), createdById: input.adminUserId },
  });
  await audit(tx, { tenantId: tenant.id, userId: input.adminUserId, action: "platform_create", entity: "Tenant", entityId: tenant.id, data: { name: input.name, plan: plan.code, ownerEmail: email } });
  return { tenant, token };
}

export async function updateTenantSubscription(
  tx: Tx,
  adminUserId: string,
  input: { tenantId: string; plan: PlanCode; status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED"; expiresAt: Date | null; billingNote: string | null },
) {
  const tenant = await tx.tenant.findUnique({ where: { id: input.tenantId }, include: { subscription: { include: { plan: true } } } });
  if (!tenant) throw new ServiceError("المنشأة غير موجودة");
  await ensurePlans(tx);
  const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { code: input.plan } });
  const data = { planId: plan.id, status: input.status, expiresAt: input.expiresAt, billingNote: input.billingNote };
  if (tenant.subscription) await tx.subscription.update({ where: { tenantId: tenant.id }, data });
  else await tx.subscription.create({ data: { tenantId: tenant.id, ...data } });
  await audit(tx, {
    tenantId: tenant.id, userId: adminUserId, action: "platform_subscription", entity: "Subscription", entityId: tenant.id,
    data: { from: tenant.subscription ? { plan: tenant.subscription.plan.code, status: tenant.subscription.status } : null, to: { plan: plan.code, status: input.status, expiresAt: input.expiresAt?.toISOString() ?? null } },
  });
}
