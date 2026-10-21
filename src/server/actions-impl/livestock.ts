import "server-only";
import { z } from "zod";
import { companyAction } from "@/server/action";
import { addHerdExpense, createHerd, recordHerdBirth, recordHerdDeath, recordHerdPurchase, recordHerdWeighing, sellFromHerd } from "@/server/services/livestock";
import { ServiceError, zBool, zDate, zId, zInt, zNonNegMoney, zOptId, zOptText, zPositiveMoney, zText } from "@/server/services/actor";

const settlement = z.object({ accountId: z.string().min(1, "اختر طريقة السداد"), supplierId: zOptId });
const qty = zInt(1, 1_000_000);

export const createHerdAction = companyAction(
  { permission: "livestock.create", schema: z.object({ name: zText(100), species: zText(60), breed: zOptText(60), location: zOptText(120), activityId: zOptId, shipmentId: zOptId, notes: zOptText(1000) }) },
  async ({ tx, data, actor }) => {
    const h = await createHerd(tx, actor, data);
    return { message: "تم إنشاء القطيع", redirect: `/livestock/${h.id}` };
  },
);

export const herdPurchaseAction = companyAction(
  { permission: "livestock.create", schema: z.object({ herdId: zId, date: zDate, quantity: qty, amount: zPositiveMoney, settlement, note: zOptText(300) }) },
  async ({ tx, data, actor }) => {
    await recordHerdPurchase(tx, actor, data);
    return "تم تسجيل الشراء وترحيل القيد";
  },
);

export const herdExpenseAction = companyAction(
  { permission: "livestock.update", schema: z.object({ herdId: zId, category: zText(40), description: zOptText(300), amount: zPositiveMoney, vatAmount: zNonNegMoney.optional(), vatRecoverable: zBool, date: zDate, settlement }) },
  async ({ tx, data, actor }) => {
    await addHerdExpense(tx, actor, data);
    return "تم تسجيل المصروف وإضافته لتكلفة القطيع";
  },
);

export const herdBirthAction = companyAction(
  { permission: "livestock.update", schema: z.object({ herdId: zId, date: zDate, quantity: qty, note: zOptText(300) }) },
  async ({ tx, data, actor }) => {
    await recordHerdBirth(tx, actor, data);
    return "تم تسجيل المواليد";
  },
);

export const herdDeathAction = companyAction(
  { permission: "livestock.update", schema: z.object({ herdId: zId, date: zDate, quantity: qty, note: zOptText(300) }) },
  async ({ tx, data, actor }) => {
    await recordHerdDeath(tx, actor, data);
    return "تم تسجيل النفوق وتحميل تكلفته";
  },
);

export const herdWeighingAction = companyAction(
  {
    permission: "livestock.update",
    schema: z.object({ herdId: zId, date: zDate, quantity: zInt(0, 1_000_000), avgWeightKg: z.coerce.number().positive("الوزن غير صالح").max(5000), note: zOptText(300) }),
  },
  async ({ tx, data, actor }) => {
    await recordHerdWeighing(tx, actor, data);
    return "تم تسجيل الوزن";
  },
);

export const herdSaleAction = companyAction(
  {
    permission: "invoices.create",
    schema: z.object({
      herdId: zId, customerId: z.string().min(1, "اختر العميل"), date: zDate, quantity: qty, unitPrice: zPositiveMoney, vatRate: z.coerce.number().min(0).max(100),
      paidAmount: zNonNegMoney.optional(), paidAccountId: zOptId,
    }),
  },
  async ({ tx, data, actor }) => {
    const paid = data.paidAmount && Number(data.paidAmount) > 0;
    if (paid && !data.paidAccountId) throw new ServiceError("اختر حساب الاستلام للمبلغ المدفوع");
    const r = await sellFromHerd(tx, actor, { ...data, paidNow: paid ? { amount: data.paidAmount!, accountId: data.paidAccountId! } : null });
    return { message: `تم البيع وإصدار الفاتورة ${r.invoice.number} · الربح ${r.profit.toFixed(2)}`, redirect: `/invoices/${r.invoice.id}` };
  },
);
