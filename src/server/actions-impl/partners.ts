import "server-only";
import { z } from "zod";
import { companyAction, tenantAction } from "@/server/action";
import { audit } from "@/lib/audit";
import { createAgreement, distributeProfit, recordPartnerMovement } from "@/server/services/partners";
import { ServiceError, zBool, zDate, zId, zMoney, zNonNegMoney, zOptId, zOptText, zPositiveMoney, zText } from "@/server/services/actor";

const pct = z.union([z.string(), z.number()]).optional().nullable()
  .transform((v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim()))
  .refine((v) => v === null || (/^\d{1,3}(\.\d{1,4})?$/.test(v) && Number(v) <= 100), "نسبة غير صالحة");

export const createPartnerAction = tenantAction(
  {
    permission: "partners.manage",
    schema: z.object({ name: zText(150), phone: zOptText(30), email: zOptText(254), nationalId: zOptText(30), isInvestor: zBool, notes: zOptText(1000) }),
  },
  async ({ tx, data, ctx }) => {
    const p = await tx.partner.create({ data: { tenantId: ctx.tenant.id, ...data } });
    await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "create", entity: "Partner", entityId: p.id, data: { name: p.name } });
    return `تمت إضافة ${data.isInvestor ? "المستثمر" : "الشريك"} ${p.name}`;
  },
);

export const createAgreementAction = companyAction(
  {
    permission: "partners.manage",
    schema: z.object({
      name: zText(150),
      scope: z.enum(["COMPANY", "ACTIVITY", "SHIPMENT", "VEHICLE", "TRANSACTION"]),
      scopeRefId: zOptId,
      notes: zOptText(1000),
      shares: z.array(z.object({ partnerId: z.string().min(1, "اختر الشريك"), capitalAmount: zNonNegMoney.optional(), profitSharePct: pct, lossSharePct: pct })).min(1, "أضف شريكًا واحدًا على الأقل").max(50),
    }),
  },
  async ({ tx, data, actor }) => {
    if (data.scope !== "COMPANY" && data.scope !== "TRANSACTION" && !data.scopeRefId) throw new ServiceError("اختر المرجع لنطاق الشراكة");
    const a = await createAgreement(tx, actor, { ...data, shares: data.shares.map((s) => ({ ...s, capitalAmount: s.capitalAmount ?? 0 })) });
    return { message: "تم إنشاء اتفاقية الشراكة", redirect: `/partners/${a.id}` };
  },
);

export const partnerMovementAction = companyAction(
  {
    permission: "partners.manage",
    schema: z.object({ agreementId: zId, partnerId: zId, type: z.enum(["CONTRIBUTION", "WITHDRAWAL"]), amount: zPositiveMoney, date: zDate, accountId: z.string().min(1, "اختر الحساب"), note: zOptText(300) }),
  },
  async ({ tx, data, actor }) => {
    await recordPartnerMovement(tx, actor, data);
    return data.type === "CONTRIBUTION" ? "تم تسجيل المساهمة وترحيل القيد" : "تم تسجيل السحب وترحيل القيد";
  },
);

export const distributeProfitAction = companyAction(
  { permission: "partners.manage", schema: z.object({ agreementId: zId, amount: zMoney, date: zDate, post: zBool, note: zOptText(300) }) },
  async ({ tx, data, ctx, actor }) => {
    if (data.post && !ctx.permissions.has("accounting.create")) throw new ServiceError("الترحيل للدفاتر يتطلب صلاحية إنشاء قيود محاسبية");
    const parts = await distributeProfit(tx, actor, data);
    return `تم ${Number(data.amount) >= 0 ? "توزيع الأرباح" : "تحميل الخسائر"} على ${parts.length} شركاء${data.post ? " وترحيل القيد" : ""}`;
  },
);
