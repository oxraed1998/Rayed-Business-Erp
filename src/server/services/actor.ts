import { z } from "zod";

/** Who is acting, and in which tenant/company. Every service call is scoped by this. */
export interface Actor {
  tenantId: string;
  companyId: string;
  userId: string;
}

export class ServiceError extends Error {}

export const NotFound = (what = "السجل") => new ServiceError(`${what} غير موجود أو لا تملك صلاحية الوصول إليه`);

// Shared validators.
export const zId = z.string().min(1).max(40);
export const zMoney = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(/,/g, ""))
  .refine((v) => /^-?\d{1,14}(\.\d{1,2})?$/.test(v), "مبلغ غير صالح");
export const zPositiveMoney = zMoney.refine((v) => Number(v) > 0, "يجب أن يكون المبلغ أكبر من صفر");
export const zNonNegMoney = zMoney.refine((v) => !v.startsWith("-"), "لا يسمح بمبلغ سالب");
export const zRate = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,8}(\.\d{1,6})?$/.test(v) && Number(v) > 0, "سعر صرف غير صالح");
export const zDate = z.coerce.date().refine((d) => !Number.isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2200, "تاريخ غير صالح");
export const zText = (max = 200) => z.string().trim().min(1, "حقل مطلوب").max(max);
export const zOptText = (max = 500) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
export const zCurrency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "رمز عملة غير صالح");
