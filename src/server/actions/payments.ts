"use server";
import { z } from "zod";
import { companyAction } from "@/server/action";
import { recordPayment } from "@/server/services/invoices";
import { ServiceError, zBool, zDate, zOptId, zOptText, zPositiveMoney } from "@/server/services/actor";

export const recordPaymentAction = companyAction(
  {
    permission: "payments.create",
    schema: z.object({
      direction: z.enum(["IN", "OUT"]),
      method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"]),
      date: zDate,
      amount: zPositiveMoney,
      accountId: z.string().min(1, "اختر حساب الصندوق أو البنك"),
      customerId: zOptId,
      supplierId: zOptId,
      isRefund: zBool,
      reference: zOptText(100),
      notes: zOptText(500),
      invoiceId: zOptId,
      autoAllocate: zBool,
    }),
  },
  async ({ tx, data, actor }) => {
    const { invoiceId, autoAllocate, ...rest } = data;
    if (data.isRefund && invoiceId) throw new ServiceError("المبالغ المستردة لا تُخصص على فاتورة");
    const p = await recordPayment(tx, actor, {
      ...rest,
      allocations: invoiceId ? [{ invoiceId, amount: data.amount }] : undefined,
      autoAllocate: invoiceId ? false : autoAllocate,
    });
    return `تم تسجيل السند ${p.number}`;
  },
);
