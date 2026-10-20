import "server-only";
import { z } from "zod";
import { companyAction } from "@/server/action";
import { approveContract, createContract, rejectContract, submitContract, terminateContract, updateContract } from "@/server/services/contracts";
import { zCurrency, zDate, zId, zInt, zNonNegMoney, zOptText, zText } from "@/server/services/actor";

const contractSchema = z.object({
  type: z.enum(["IMPORT", "PURCHASE", "SALES", "PARTNERSHIP", "INVESTMENT", "SUPPLIER", "EMPLOYMENT"]),
  title: zText(200),
  parties: zText(1000),
  startDate: zDate,
  endDate: zDate.optional().nullable(),
  value: zNonNegMoney.optional(),
  currency: zCurrency,
  paymentTerms: zOptText(1000),
  body: zOptText(20000),
  renewalReminderDays: zInt(0, 365).default(30),
});

export const createContractAction = companyAction({ permission: "contracts.manage", schema: contractSchema }, async ({ tx, data, actor }) => {
  const c = await createContract(tx, actor, { ...data, value: data.value ?? 0 });
  return { message: `تم إنشاء العقد ${c.number}`, redirect: `/contracts/${c.id}` };
});

export const updateContractAction = companyAction({ permission: "contracts.manage", schema: contractSchema.extend({ id: zId }) }, async ({ tx, data, actor }) => {
  await updateContract(tx, actor, data.id, { ...data, value: data.value ?? 0 });
  return "تم تحديث العقد";
});

export const submitContractAction = companyAction({ permission: "contracts.manage", schema: z.object({ id: zId }) }, async ({ tx, data, actor }) => {
  await submitContract(tx, actor, data.id);
  return "تم إرسال العقد للاعتماد";
});

export const approveContractAction = companyAction({ permission: "contracts.approve", schema: z.object({ id: zId }) }, async ({ tx, data, actor }) => {
  await approveContract(tx, actor, data.id);
  return "تم اعتماد العقد وأصبح نافذًا";
});

export const rejectContractAction = companyAction({ permission: "contracts.approve", schema: z.object({ id: zId }) }, async ({ tx, data, actor }) => {
  await rejectContract(tx, actor, data.id);
  return "تمت إعادة العقد إلى مسودة";
});

export const terminateContractAction = companyAction({ permission: "contracts.manage", schema: z.object({ id: zId }) }, async ({ tx, data, actor }) => {
  await terminateContract(tx, actor, data.id);
  return "تم إنهاء العقد";
});
