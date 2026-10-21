import "server-only";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";
import { formToObject, type ActionResult } from "@/server/action";
import { createTenantWithOwnerInvite, updateTenantSubscription } from "@/server/services/admin";
import { ServiceError, zDate, zId, zInt, zOptText, zText } from "@/server/services/actor";
import { appUrl } from "@/server/app-url";

const PLANS = ["FREE", "STARTER", "BUSINESS", "ENTERPRISE"] as const;
const STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"] as const;

type Handler<S extends z.ZodTypeAny> = (tx: Tx, data: z.output<S>, adminUserId: string) => Promise<string | Omit<Extract<ActionResult, { ok: true }>, "ok">>;

/** Platform-level actions: the super-admin flag is re-checked on the server for every call. */
async function runAdmin<S extends z.ZodTypeAny>(schema: S, fd: FormData, handler: Handler<S>): Promise<ActionResult> {
  try {
    const s = await getSession();
    if (!s) return { ok: false, error: "انتهت الجلسة، يرجى تسجيل الدخول مجددًا" };
    if (!s.user.isSuperAdmin) return { ok: false, error: "هذه العملية متاحة لمدير المنصة فقط" };
    const parsed = schema.safeParse(formToObject(fd));
    if (!parsed.success) return { ok: false, error: `تحقق من الحقول: ${parsed.error.issues[0].message}` };
    const r = await db.$transaction((tx) => handler(tx, parsed.data, s.userId), { timeout: 30000 });
    revalidatePath("/admin");
    return typeof r === "string" ? { ok: true, message: r } : { ok: true, ...r };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "القيمة مستخدمة مسبقًا" };
    console.error("[admin action]", e);
    return { ok: false, error: "حدث خطأ غير متوقع" };
  }
}

const createTenantSchema = z.object({ name: zText(150), ownerEmail: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح"), plan: z.enum(PLANS) });

export async function createTenantAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAdmin(createTenantSchema, fd, async (tx, data, adminId) => {
    const { tenant, token } = await createTenantWithOwnerInvite(tx, { name: data.name, ownerEmail: data.ownerEmail, plan: data.plan, adminUserId: adminId });
    return { message: `تم إنشاء المنشأة ${tenant.name}. أرسل رابط الدعوة للمالك.`, data: { link: `${await appUrl()}/invite/${token}` } };
  });
}

const subscriptionSchema = z.object({ tenantId: zId, plan: z.enum(PLANS), status: z.enum(STATUSES), expiresAt: zDate.optional(), billingNote: zOptText(300) });

export async function updateSubscriptionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAdmin(subscriptionSchema, fd, async (tx, data, adminId) => {
    await updateTenantSubscription(tx, adminId, { ...data, expiresAt: data.expiresAt ?? null, billingNote: data.billingNote });
    return "تم تحديث الاشتراك";
  });
}

export async function toggleTenantAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAdmin(z.object({ tenantId: zId }), fd, async (tx, data, adminId) => {
    const t = await tx.tenant.findUnique({ where: { id: data.tenantId } });
    if (!t) throw new ServiceError("المنشأة غير موجودة");
    await tx.tenant.update({ where: { id: t.id }, data: { isActive: !t.isActive } });
    // Suspension signs all of the tenant's sessions out.
    if (t.isActive) await tx.session.deleteMany({ where: { tenantId: t.id } });
    await audit(tx, { tenantId: t.id, userId: adminId, action: t.isActive ? "platform_suspend" : "platform_activate", entity: "Tenant", entityId: t.id });
    return t.isActive ? "تم تعليق المنشأة" : "تم تفعيل المنشأة";
  });
}

const planSchema = z.object({ code: z.enum(PLANS), maxCompanies: zInt(1, 10000), maxUsers: zInt(1, 100000), monthlyPrice: z.coerce.number().min(0).max(10_000_000) });

export async function updatePlanAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAdmin(planSchema, fd, async (tx, data, adminId) => {
    const p = await tx.subscriptionPlan.update({ where: { code: data.code }, data: { maxCompanies: data.maxCompanies, maxUsers: data.maxUsers, monthlyPrice: data.monthlyPrice.toFixed(2) } });
    await audit(tx, { tenantId: null, userId: adminId, action: "platform_plan", entity: "SubscriptionPlan", entityId: p.id, data });
    return `تم تحديث باقة ${p.nameAr}`;
  });
}
