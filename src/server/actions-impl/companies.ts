import "server-only";
import { z } from "zod";
import { companyAction, tenantAction } from "@/server/action";
import { createCompany } from "@/server/services/tenancy";
import { zBool, zCurrency, zOptText, zText, ServiceError, NotFound } from "@/server/services/actor";
import { audit } from "@/lib/audit";

const ACTIVITY_TYPES = ["VEHICLES", "LIVESTOCK", "CLOTHING", "GENERAL"] as const;
const DEFAULT_NAMES = { VEHICLES: "تجارة السيارات", LIVESTOCK: "تجارة المواشي", CLOTHING: "تجارة الملابس", GENERAL: "تجارة عامة" };

export const createCompanyAction = tenantAction(
  {
    permission: "companies.manage",
    schema: z.object({
      name: zText(150), legalName: zOptText(200), taxNumber: zOptText(30), crNumber: zOptText(30), baseCurrency: zCurrency,
      VEHICLES: zBool, LIVESTOCK: zBool, CLOTHING: zBool, GENERAL: zBool,
    }),
  },
  async ({ tx, data, ctx }) => {
    if (data.taxNumber && !/^3\d{13}3$/.test(data.taxNumber)) throw new ServiceError("الرقم الضريبي السعودي يتكون من 15 رقمًا ويبدأ وينتهي بالرقم 3");
    const activities = ACTIVITY_TYPES.filter((t) => data[t]).map((t) => ({ name: DEFAULT_NAMES[t], type: t }));
    if (!activities.length) throw new ServiceError("اختر نشاطًا تجاريًا واحدًا على الأقل");
    const c = await createCompany(tx, ctx.tenant.id, ctx.user.id, { ...data, activities });
    await tx.session.update({ where: { id: ctx.sessionId }, data: { companyId: c.id } });
    return { message: `تم إنشاء ${c.name} وتجهيز دليل الحسابات`, redirect: "/" };
  },
);

export const updateCompanyAction = companyAction(
  {
    permission: "companies.manage",
    schema: z.object({ name: zText(150), legalName: zOptText(200), taxNumber: zOptText(30), crNumber: zOptText(30), address: zOptText(300), phone: zOptText(30), email: zOptText(254), vatRate: z.coerce.number().min(0).max(100) }),
  },
  async ({ tx, data, ctx, actor }) => {
    if (data.taxNumber && !/^3\d{13}3$/.test(data.taxNumber)) throw new ServiceError("الرقم الضريبي السعودي يتكون من 15 رقمًا ويبدأ وينتهي بالرقم 3");
    await tx.company.update({ where: { id: ctx.company.id }, data: { ...data, vatRate: data.vatRate.toFixed(2) } });
    await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "update", entity: "Company", entityId: actor.companyId, data });
    return "تم تحديث بيانات الشركة";
  },
);

export const createActivityAction = companyAction(
  { permission: "companies.manage", schema: z.object({ name: zText(100), type: z.enum(ACTIVITY_TYPES) }) },
  async ({ tx, data, actor }) => {
    const a = await tx.businessActivity.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, ...data } });
    await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "BusinessActivity", entityId: a.id, data });
    return "تمت إضافة النشاط";
  },
);

export const toggleActivityAction = companyAction(
  { permission: "companies.manage", schema: z.object({ id: z.string() }) },
  async ({ tx, data, actor }) => {
    const a = await tx.businessActivity.findFirst({ where: { id: data.id, tenantId: actor.tenantId, companyId: actor.companyId } });
    if (!a) throw NotFound("النشاط");
    await tx.businessActivity.update({ where: { id: a.id }, data: { isActive: !a.isActive } });
    return a.isActive ? "تم إيقاف النشاط" : "تم تفعيل النشاط";
  },
);
