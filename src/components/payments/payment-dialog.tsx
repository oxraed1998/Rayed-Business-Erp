"use client";
import { useState } from "react";
import { FormDialog } from "@/components/forms/form-dialog";
import { CheckboxField, DateField, Grid, MoneyField, SelectField, TextField } from "@/components/forms/fields";
import { recordPaymentAction } from "@/server/actions/payments";
import type { Option } from "@/server/queries/options";
import { today } from "@/lib/utils";

const METHODS: Option[] = [
  { value: "CASH", label: "نقدًا" }, { value: "BANK_TRANSFER", label: "تحويل بنكي" }, { value: "CARD", label: "بطاقة" },
  { value: "CHEQUE", label: "شيك" }, { value: "OTHER", label: "أخرى" },
];

/**
 * Receipt voucher (IN, from a customer) or payment voucher (OUT, to a supplier).
 * A refund flips the party side: OUT + refund = money back to a customer; IN + refund = money back from a supplier.
 */
export function PaymentDialog({
  direction, cashAccounts, customers = [], suppliers = [], invoice, triggerLabel, triggerVariant, triggerSize, allowRefund = true,
}: {
  direction: "IN" | "OUT"; cashAccounts: Option[]; customers?: Option[]; suppliers?: Option[];
  invoice?: { id: string; number: string; remaining: string; customerId?: string | null; supplierId?: string | null };
  triggerLabel?: string; triggerVariant?: "default" | "outline" | "gold" | "secondary"; triggerSize?: "sm" | "default"; allowRefund?: boolean;
}) {
  const [refund, setRefund] = useState(false);
  const customerSide = direction === "IN" ? !refund : refund;
  const title = invoice ? `تسجيل دفعة على ${invoice.number}` : direction === "IN" ? (refund ? "استرداد من مورد" : "سند قبض") : refund ? "رد مبلغ لعميل" : "سند صرف";
  return (
    <FormDialog title={title} description={direction === "IN" ? "يُرحّل قيد: من حـ/ الصندوق أو البنك إلى حـ/ الطرف" : "يُرحّل قيد: من حـ/ الطرف إلى حـ/ الصندوق أو البنك"}
      trigger={triggerLabel ?? (direction === "IN" ? "سند قبض" : "سند صرف")} triggerVariant={triggerVariant ?? (direction === "IN" ? "default" : "outline")} triggerSize={triggerSize} action={recordPaymentAction}>
      <input type="hidden" name="direction" value={direction} />
      {invoice && <input type="hidden" name="invoiceId" value={invoice.id} />}
      {refund && <input type="hidden" name="isRefund" value="on" />}
      {!invoice && allowRefund && (
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} className="size-4 accent-[hsl(var(--gold))]" />
          {direction === "IN" ? "استرداد مبلغ من مورد" : "رد مبلغ لعميل (استرداد)"}
        </label>
      )}
      <Grid>
        {invoice ? (
          customerSide ? <input type="hidden" name="customerId" value={invoice.customerId ?? ""} /> : <input type="hidden" name="supplierId" value={invoice.supplierId ?? ""} />
        ) : customerSide ? (
          <SelectField key="c" name="customerId" label="العميل" required options={customers} placeholder="اختر العميل" />
        ) : (
          <SelectField key="s" name="supplierId" label="المورد" required options={suppliers} placeholder="اختر المورد" />
        )}
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
        <MoneyField name="amount" label="المبلغ" required defaultValue={invoice?.remaining} hint={invoice ? `المتبقي على الفاتورة: ${invoice.remaining}` : undefined} />
        <SelectField name="accountId" label={direction === "IN" ? "إلى حساب" : "من حساب"} required options={cashAccounts} />
        <SelectField name="method" label="طريقة الدفع" options={METHODS} />
        <TextField name="reference" label="المرجع" placeholder="رقم الحوالة / الشيك" />
      </Grid>
      <TextField name="notes" label="ملاحظات" />
      {!invoice && !refund && <CheckboxField name="autoAllocate" label="تخصيص تلقائي على أقدم الفواتير المفتوحة" defaultChecked />}
    </FormDialog>
  );
}
