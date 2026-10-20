"use server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { canAssignRole, isPermission } from "@/lib/permissions";
import { tenantAction, type ActionResult } from "@/server/action";
import { createInvitation } from "@/server/services/tenancy";
import { NotFound, ServiceError, zId } from "@/server/services/actor";
import { appUrl } from "@/server/app-url";

const ROLES = ["TENANT_OWNER", "COMPANY_ADMIN", "ACCOUNTANT", "MANAGER", "EMPLOYEE", "VIEWER"] as const;

// Repeated checkbox names arrive as a string (one checked) or an array (several).
const zList = z.preprocess((v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]), z.array(z.string().max(60)).max(200));

async function loadMember(tx: Tx, tenantId: string, membershipId: string) {
  const m = await tx.membership.findFirst({ where: { id: membershipId, tenantId }, include: { user: true } });
  if (!m) throw NotFound("العضو");
  return m;
}

const activeOwners = (tx: Tx, tenantId: string) => tx.membership.count({ where: { tenantId, role: "TENANT_OWNER", isActive: true } });

/** Non-owners may only manage members ranked strictly below them. */
function assertCanManage(actorRole: Role, targetRole: Role) {
  if (actorRole !== "TENANT_OWNER" && !canAssignRole(actorRole, targetRole)) throw new ServiceError("لا يمكنك تعديل عضو بنفس دورك أو أعلى منه");
}

export const updateMemberAction = tenantAction(
  {
    permission: "users.manage",
    schema: z.object({ membershipId: zId, role: z.enum(ROLES), companyIds: zList, grants: zList, denials: zList }),
  },
  async ({ tx, data, ctx }) => {
    const m = await loadMember(tx, ctx.tenant.id, data.membershipId);
    if (m.userId === ctx.user.id && data.role !== m.role) throw new ServiceError("لا يمكنك تغيير دورك بنفسك");
    assertCanManage(ctx.role, m.role);
    if (data.role !== m.role && !canAssignRole(ctx.role, data.role)) throw new ServiceError("لا يمكنك منح دور أعلى من صلاحياتك");
    if (m.role === "TENANT_OWNER" && data.role !== "TENANT_OWNER" && m.isActive && (await activeOwners(tx, ctx.tenant.id)) <= 1) {
      throw new ServiceError("لا يمكن تخفيض دور المالك الوحيد للمنشأة");
    }
    if (data.companyIds.length) {
      const n = await tx.company.count({ where: { tenantId: ctx.tenant.id, id: { in: data.companyIds } } });
      if (n !== data.companyIds.length) throw new ServiceError("شركة غير صالحة");
    }
    const grants = data.grants.filter(isPermission);
    const denials = data.denials.filter(isPermission).filter((p) => !grants.includes(p));
    await tx.membership.update({ where: { id: m.id }, data: { role: data.role, companyIds: data.companyIds, grants, denials } });
    await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "update", entity: "Membership", entityId: m.id, data: { email: m.user.email, from: m.role, role: data.role, companyIds: data.companyIds, grants, denials } });
    return "تم تحديث صلاحيات العضو";
  },
);

export const toggleMemberAction = tenantAction(
  { permission: "users.manage", schema: z.object({ membershipId: zId }) },
  async ({ tx, data, ctx }) => {
    const m = await loadMember(tx, ctx.tenant.id, data.membershipId);
    if (m.userId === ctx.user.id) throw new ServiceError("لا يمكنك إيقاف عضويتك بنفسك");
    assertCanManage(ctx.role, m.role);
    if (m.isActive && m.role === "TENANT_OWNER" && (await activeOwners(tx, ctx.tenant.id)) <= 1) throw new ServiceError("لا يمكن إيقاف المالك الوحيد للمنشأة");
    await tx.membership.update({ where: { id: m.id }, data: { isActive: !m.isActive } });
    // Deactivation signs the member out of this tenant immediately.
    if (m.isActive) await tx.session.deleteMany({ where: { userId: m.userId, tenantId: ctx.tenant.id } });
    await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, action: m.isActive ? "deactivate" : "activate", entity: "Membership", entityId: m.id, data: { email: m.user.email } });
    return m.isActive ? "تم إيقاف العضو وإنهاء جلساته" : "تم تفعيل العضو";
  },
);

export const inviteMemberAction = tenantAction(
  {
    permission: "users.manage",
    schema: z.object({ email: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح").max(254), role: z.enum(ROLES), companyIds: zList }),
  },
  async ({ tx, data, ctx }) => {
    if (!canAssignRole(ctx.role, data.role)) throw new ServiceError("لا يمكنك دعوة عضو بدور أعلى من صلاحياتك");
    const { token } = await createInvitation(tx, ctx.tenant.id, ctx.user.id, data);
    return { message: "تم إنشاء الدعوة", data: { link: `${await appUrl()}/invite/${token}` } };
  },
);

export const revokeInvitationAction = tenantAction(
  { permission: "users.manage", schema: z.object({ invitationId: zId }) },
  async ({ tx, data, ctx }) => {
    const inv = await tx.invitation.findFirst({ where: { id: data.invitationId, tenantId: ctx.tenant.id, acceptedAt: null } });
    if (!inv) throw NotFound("الدعوة");
    await tx.invitation.delete({ where: { id: inv.id } });
    await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "revoke", entity: "Invitation", entityId: inv.id, data: { email: inv.email } });
    return "تم إلغاء الدعوة";
  },
);

export const resetLinkAction = tenantAction(
  { permission: "users.manage", schema: z.object({ membershipId: zId }) },
  async ({ tx, data, ctx }) => {
    const m = await loadMember(tx, ctx.tenant.id, data.membershipId);
    assertCanManage(ctx.role, m.role);
    if (m.user.isSuperAdmin && !ctx.user.isSuperAdmin) throw new ServiceError("لا يمكن إنشاء رابط استعادة لحساب مدير المنصة");
    const token = newToken();
    // Only one live reset link per user.
    await tx.passwordResetToken.deleteMany({ where: { userId: m.userId, usedAt: null } });
    await tx.passwordResetToken.create({ data: { userId: m.userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "reset_link", entity: "User", entityId: m.userId, data: { email: m.user.email } });
    return { message: "تم إنشاء رابط إعادة التعيين (صالح لساعة واحدة)", data: { link: `${await appUrl()}/reset-password/${token}` } };
  },
);

export async function signOutOtherSessionsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  void fd;
  const s = await getSession();
  if (!s) return { ok: false, error: "انتهت الجلسة، يرجى تسجيل الدخول مجددًا" };
  const r = await db.session.deleteMany({ where: { userId: s.userId, id: { not: s.id } } });
  await audit(db, { tenantId: s.tenantId, userId: s.userId, action: "sign_out_others", entity: "User", entityId: s.userId, data: { sessions: r.count } });
  return { ok: true, message: r.count ? `تم إنهاء ${r.count} جلسة أخرى` : "لا توجد جلسات أخرى" };
}
