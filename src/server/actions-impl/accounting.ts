import "server-only";
import { z } from "zod";
import { companyAction } from "@/server/action";
import { closePeriod, createAccount, createManualEntry, createPeriod, deleteDraftEntry, postEntry, reverseEntry } from "@/server/services/accounting";
import { ServiceError, zBool, zDate, zId, zNonNegMoney, zOptId, zOptText, zText } from "@/server/services/actor";

export const createAccountAction = companyAction(
  {
    permission: "accounting.create",
    schema: z.object({
      code: z.string().trim().regex(/^[0-9A-Za-z.-]{1,20}$/, "رمز حساب غير صالح"),
      name: zText(120),
      type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
      isCashLike: zBool,
      bankName: zOptText(120),
      iban: z.string().optional().nullable()
        .transform((v) => (v ? v.replace(/\s+/g, "").toUpperCase() : null))
        .refine((v) => !v || /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v), "رقم IBAN غير صالح"),
      parentId: zOptId,
    }),
  },
  async ({ tx, data, actor }) => {
    const a = await createAccount(tx, actor, data);
    return `تمت إضافة الحساب ${a.code} · ${a.name}`;
  },
);

const line = z.object({
  accountId: z.string().min(1, "اختر الحساب"),
  debit: zNonNegMoney.optional(),
  credit: zNonNegMoney.optional(),
  description: zOptText(300),
  activityId: zOptId,
  customerId: zOptId,
  supplierId: zOptId,
});

export const createJournalEntryAction = companyAction(
  {
    permission: "accounting.create",
    schema: z.object({ date: zDate, description: zText(500), mode: z.enum(["draft", "post"]).default("draft"), lines: z.array(line).min(2, "القيد يحتاج سطرين على الأقل").max(100) }),
  },
  async ({ tx, data, ctx, actor }) => {
    const post = data.mode === "post";
    if (post && !ctx.permissions.has("accounting.approve")) throw new ServiceError("ترحيل القيود يتطلب صلاحية اعتماد المحاسبة؛ احفظ القيد كمسودة");
    const e = await createManualEntry(tx, actor, { date: data.date, description: data.description, post, lines: data.lines.map((l) => ({ ...l, debit: l.debit ?? 0, credit: l.credit ?? 0 })) });
    return { message: post ? `تم ترحيل القيد ${e.number}` : `تم حفظ القيد ${e.number} كمسودة`, redirect: `/accounting/journal/${e.id}` };
  },
);

export const postJournalEntryAction = companyAction(
  { permission: "accounting.approve", schema: z.object({ id: zId }) },
  async ({ tx, data, actor }) => {
    const e = await postEntry(tx, actor, data.id);
    return `تم ترحيل القيد ${e.number}`;
  },
);

export const deleteJournalEntryAction = companyAction(
  { permission: "accounting.create", schema: z.object({ id: zId }) },
  async ({ tx, data, actor }) => {
    await deleteDraftEntry(tx, actor, data.id);
    return { message: "تم حذف المسودة", redirect: "/accounting/journal" };
  },
);

export const reverseJournalEntryAction = companyAction(
  { permission: "accounting.approve", schema: z.object({ id: zId, date: zDate.optional() }) },
  async ({ tx, data, actor }) => {
    const r = await reverseEntry(tx, actor, data.id, data.date ?? new Date());
    return { message: `تم إنشاء القيد العكسي ${r.number}`, redirect: `/accounting/journal/${r.id}` };
  },
);

export const createPeriodAction = companyAction(
  { permission: "accounting.close", schema: z.object({ name: zText(100), startDate: zDate, endDate: zDate }) },
  async ({ tx, data, actor }) => {
    await createPeriod(tx, actor, data);
    return "تمت إضافة الفترة المالية";
  },
);

export const closePeriodAction = companyAction(
  { permission: "accounting.close", schema: z.object({ id: zId }) },
  async ({ tx, data, actor }) => {
    const r = await closePeriod(tx, actor, data.id);
    return r.entryNumber ? `تم إقفال الفترة بقيد الإقفال ${r.entryNumber} (صافي الربح ${r.net.toFixed(2)})` : "تم إقفال الفترة (لا توجد إيرادات أو مصروفات)";
  },
);
