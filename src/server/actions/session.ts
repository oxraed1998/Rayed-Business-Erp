"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { clientIp, createSession, destroySession, getSession } from "@/lib/auth/session";
import { dummyHashFor, hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { clearRateLimit, rateLimit } from "@/lib/auth/rate-limit";
import { hashToken } from "@/lib/auth/tokens";
import { getTenantContext } from "@/lib/context";
import { timingSafeEqual } from "node:crypto";
import { acceptInvitation, bootstrapPlatform } from "@/server/services/tenancy";
import { ServiceError } from "@/server/services/actor";
import type { ActionResult } from "@/server/action";
import { formToObject } from "@/server/action";

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح").max(254), password: z.string().min(1, "أدخل كلمة المرور").max(128) });

export async function loginAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { email, password } = parsed.data;
  const ip = await clientIp();
  // Two buckets: per account (stops targeted guessing) and per IP (stops spraying).
  const okAccount = await rateLimit(`login:acct:${email}`, 8, 15 * 60 * 1000);
  const okIp = await rateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000);
  if (!okAccount || !okIp) return { ok: false, error: "محاولات كثيرة. حاول مجددًا بعد 15 دقيقة." };

  const user = await db.user.findUnique({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHashFor()));
  if (!user || !valid || !user.isActive) {
    await db.auditLog.create({ data: { tenantId: null, action: "login_failed", entity: "User", entityId: user?.id ?? null, ip, data: { email } } });
    return { ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
  }
  await clearRateLimit(`login:acct:${email}`);
  const membership = await db.membership.findFirst({ where: { userId: user.id, isActive: true }, orderBy: { createdAt: "asc" } });
  await createSession(user.id, membership?.tenantId ?? null);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await db.auditLog.create({ data: { tenantId: membership?.tenantId ?? null, userId: user.id, action: "login", entity: "User", entityId: user.id, ip } });
  const next = String(fd.get("next") ?? "/");
  return { ok: true, message: `مرحبًا ${user.name}`, redirect: next.startsWith("/") && !next.startsWith("//") ? next : "/" };
}

export async function logoutAction() {
  const s = await getSession();
  if (s) await db.auditLog.create({ data: { tenantId: s.tenantId, userId: s.userId, action: "logout", entity: "User", entityId: s.userId } });
  await destroySession();
}

export async function switchCompanyAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "انتهت الجلسة" };
  const id = String(fd.get("companyId") ?? "");
  // Only companies the membership can access are in ctx.companies.
  if (!ctx.companies.some((c) => c.id === id)) return { ok: false, error: "لا تملك صلاحية الوصول لهذه الشركة" };
  await db.session.update({ where: { id: ctx.sessionId }, data: { companyId: id } });
  return { ok: true };
}

const setupSchema = z.object({
  token: z.string().min(1, "رمز الإعداد مطلوب"),
  name: z.string().trim().min(2, "الاسم مطلوب").max(100),
  email: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح"),
  password: z.string(),
  tenantName: z.string().trim().min(2, "اسم المنشأة مطلوب").max(150),
});

export async function setupAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const expected = process.env.SETUP_TOKEN ?? "";
  if (expected.length < 16) return { ok: false, error: "الإعداد الأولي معطل: لم يتم ضبط SETUP_TOKEN على الخادم" };
  if (!(await rateLimit(`setup:${await clientIp()}`, 10, 60 * 60 * 1000))) return { ok: false, error: "محاولات كثيرة" };
  const parsed = setupSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const a = Buffer.from(parsed.data.token), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: "رمز الإعداد غير صحيح" };
  const problem = passwordProblem(parsed.data.password);
  if (problem) return { ok: false, error: problem };
  try {
    const { user, tenant } = await bootstrapPlatform(parsed.data);
    await createSession(user.id, tenant.id);
    return { ok: true, message: "تم إعداد المنصة بنجاح", redirect: "/settings/companies?first=1" };
  } catch (e) {
    return { ok: false, error: e instanceof ServiceError ? e.message : "تعذر إكمال الإعداد" };
  }
}

const acceptSchema = z.object({ token: z.string().min(10), name: z.string().trim().min(2, "الاسم مطلوب").max(100), password: z.string() });

export async function acceptInviteAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = acceptSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const problem = passwordProblem(parsed.data.password);
  if (problem) return { ok: false, error: problem };
  try {
    const r = await acceptInvitation(parsed.data.token, parsed.data);
    if (r.existingUser) return { ok: true, message: "تمت إضافتك للمنشأة. سجّل الدخول بحسابك الحالي.", redirect: "/login" };
    await createSession(r.user.id, r.tenantId);
    return { ok: true, message: "مرحبًا بك!", redirect: "/" };
  } catch (e) {
    return { ok: false, error: e instanceof ServiceError ? e.message : "تعذر قبول الدعوة" };
  }
}

const resetSchema = z.object({ token: z.string().min(10), password: z.string(), confirm: z.string() });

export async function resetPasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };
  if (parsed.data.password !== parsed.data.confirm) return { ok: false, error: "كلمتا المرور غير متطابقتين" };
  const problem = passwordProblem(parsed.data.password);
  if (problem) return { ok: false, error: problem };
  const t = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) } });
  if (!t || t.usedAt || t.expiresAt < new Date()) return { ok: false, error: "رابط إعادة التعيين غير صالح أو منتهي" };
  await db.$transaction([
    db.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword(parsed.data.password) } }),
    db.passwordResetToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    // Sign out everywhere after a reset.
    db.session.deleteMany({ where: { userId: t.userId } }),
    db.auditLog.create({ data: { userId: t.userId, action: "password_reset", entity: "User", entityId: t.userId } }),
  ]);
  return { ok: true, message: "تم تغيير كلمة المرور. سجّل الدخول الآن.", redirect: "/login" };
}

const changeSchema = z.object({ current: z.string().min(1), password: z.string(), confirm: z.string(), name: z.string().trim().min(2).max(100) });

export async function updateProfileAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await getSession();
  if (!s) redirect("/login");
  const parsed = changeSchema.partial({ password: true, confirm: true, current: true }).safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.password) {
    if (!d.current || !(await verifyPassword(d.current, s.user.passwordHash))) return { ok: false, error: "كلمة المرور الحالية غير صحيحة" };
    if (d.password !== d.confirm) return { ok: false, error: "كلمتا المرور غير متطابقتين" };
    const problem = passwordProblem(d.password);
    if (problem) return { ok: false, error: problem };
    await db.user.update({ where: { id: s.userId }, data: { passwordHash: await hashPassword(d.password) } });
    await db.session.deleteMany({ where: { userId: s.userId, id: { not: s.id } } });
    await audit(db, { tenantId: s.tenantId, userId: s.userId, action: "password_change", entity: "User", entityId: s.userId });
  }
  if (d.name && d.name !== s.user.name) await db.user.update({ where: { id: s.userId }, data: { name: d.name } });
  return { ok: true, message: d.password ? "تم تحديث الملف وكلمة المرور، وتم إنهاء الجلسات الأخرى" : "تم تحديث الملف الشخصي" };
}
