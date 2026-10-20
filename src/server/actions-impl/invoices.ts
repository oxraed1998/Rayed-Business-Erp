import "server-only";
import { z } from "zod";
import { companyAction } from "@/server/action";
import { createInstallmentPlan, createInvoice, postInvoice, voidInvoice } from "@/server/services/invoices";
import { zBool, zCurrency, zDate, zId, zInt, zNonNegMoney, zOptId, zOptText, zRate } from "@/server/services/actor";

const qty = z.union([z.string(), z.number()]).transform((v) => String(v).trim().replace(/,/g, "")).refine((v) => /^\d{1,12}(\.\d{1,3})?$/.test(v) && Number(v) > 0, "كمية غير صالحة");
const rate = z.union([z.string(), z.number()]).transform((v) => String(v).trim()).refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, "نسبة ضريبة غير صالحة");

const lineSchema = z.object({
  description: z.string().trim().min(1, "وصف البند مطلوب").max(300),
  quantity: qty,
  unitPrice: zNonNegMoney,
  discount: zNonNegMoney.optional(),
  vatRate: rate.default("15"),
  accountId: zOptId,
});

export const createInvoiceAction = companyAction(
  {
    permission: "invoices.create",
    schema: z.object({
      type: z.enum(["SALES", "PURCHASE", "CREDIT_NOTE", "DEBIT_NOTE", "ADVANCE"]),
      issueDate: zDate,
      dueDate: zDate.optional(),
      customerId: zOptId,
      supplierId: zOptId,
      activityId: zOptId,
      relatedInvoiceId: zOptId,
      currency: zCurrency.default("SAR"),
      fxRate: zRate.default("1"),
      notes: zOptText(1000),
      postNow: zBool,
      lines: z.array(lineSchema).min(1, "أضف بندًا واحدًا على الأقل").max(200),
    }),
  },
  async ({ tx, data, actor, ctx }) => {
    const { postNow, ...input } = data;
    const inv = await createInvoice(tx, actor, input);
    if (postNow) {
      if (!ctx.permissions.has("invoices.approve")) return { message: `تم حفظ الفاتورة ${inv.number} كمسودة (الترحيل يتطلب صلاحية اعتماد الفواتير)`, redirect: `/invoices/${inv.id}` };
      await postInvoice(tx, actor, inv.id);
      return { message: `تم إصدار وترحيل الفاتورة ${inv.number}`, redirect: `/invoices/${inv.id}` };
    }
    return { message: `تم حفظ الفاتورة ${inv.number} كمسودة`, redirect: `/invoices/${inv.id}` };
  },
);

export const postInvoiceAction = companyAction({ permission: "invoices.approve", schema: z.object({ id: zId }) }, async ({ tx, data, actor }) => {
  const inv = await postInvoice(tx, actor, data.id);
  return `تم ترحيل الفاتورة ${inv.number} إلى دفتر الأستاذ`;
});

export const voidInvoiceAction = companyAction({ permission: "invoices.approve", schema: z.object({ id: zId }) }, async ({ tx, data, actor }) => {
  await voidInvoice(tx, actor, data.id);
  return "تم إلغاء الفاتورة وعكس قيدها";
});

export const createInstallmentPlanAction = companyAction(
  { permission: "invoices.create", schema: z.object({ invoiceId: zId, downPayment: zNonNegMoney.default("0"), count: zInt(1, 360), firstDueDate: zDate }) },
  async ({ tx, data, actor }) => {
    await createInstallmentPlan(tx, actor, data);
    return `تم إنشاء خطة تقسيط من ${data.count} قسط`;
  },
);
