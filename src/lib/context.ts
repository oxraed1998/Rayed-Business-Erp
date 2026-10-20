import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Company, Membership, Role, Tenant, User } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { can, effectivePermissions, type Permission } from "@/lib/permissions";

export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN" | "NO_TENANT" | "NO_COMPANY", message?: string) {
    super(message ?? code);
  }
}

export interface TenantContext {
  sessionId: string;
  user: User;
  tenant: Tenant;
  membership: Membership;
  role: Role;
  permissions: Set<Permission>;
  /** Companies this member is allowed to see. */
  companies: Company[];
  /** Currently selected company (always one of `companies`), or null if none exist. */
  company: Company | null;
}

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Loads the tenant context for the signed-in user. All tenant data access must go
 * through this: it is the single place where tenant membership and company access
 * are resolved on the server.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const session = await getSession();
  if (!session) return null;
  const memberships = await db.membership.findMany({
    where: { userId: session.userId, isActive: true, tenant: { isActive: true } },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });
  const membership = memberships.find((m) => m.tenantId === session.tenantId) ?? memberships[0];
  if (!membership) return null;

  const companies = await db.company.findMany({
    where: {
      tenantId: membership.tenantId,
      isActive: true,
      ...(membership.companyIds.length ? { id: { in: membership.companyIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  const company = companies.find((c) => c.id === session.companyId) ?? companies[0] ?? null;

  if (session.tenantId !== membership.tenantId || session.companyId !== (company?.id ?? null)) {
    await db.session.update({
      where: { id: session.id },
      data: { tenantId: membership.tenantId, companyId: company?.id ?? null },
    });
  }

  return {
    sessionId: session.id,
    user: session.user,
    tenant: membership.tenant,
    membership,
    role: membership.role,
    permissions: effectivePermissions(membership),
    companies,
    company,
  };
});

/** For pages: redirects instead of throwing. */
export async function pageContext(permission?: Permission): Promise<TenantContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  const ctx = await getTenantContext();
  if (!ctx) redirect(session.user.isSuperAdmin ? "/admin" : "/no-access");
  if (permission && !can(ctx.membership, permission)) redirect("/forbidden");
  return ctx;
}

export type CompanyContext = TenantContext & { company: Company };

export async function pageCompanyContext(permission?: Permission): Promise<CompanyContext> {
  const ctx = await pageContext(permission);
  if (!ctx.company) redirect("/settings/companies?first=1");
  return ctx as CompanyContext;
}

/** For server actions / route handlers: throws AuthError. */
export async function actionContext(permission?: Permission): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) throw new AuthError("UNAUTHENTICATED");
  if (permission && !ctx.permissions.has(permission)) throw new AuthError("FORBIDDEN");
  return ctx;
}

export async function actionCompanyContext(permission?: Permission): Promise<CompanyContext> {
  const ctx = await actionContext(permission);
  if (!ctx.company) throw new AuthError("NO_COMPANY");
  return ctx as CompanyContext;
}

/** Scope filter for company-owned rows. Use in every query. */
export const scope = (ctx: CompanyContext) => ({ tenantId: ctx.tenant.id, companyId: ctx.company.id });

export async function requireSuperAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/forbidden");
  return session;
}
