"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/forms/form-dialog";
import { DateField, Grid, MoneyField, NumberField } from "@/components/forms/fields";
import { createInstallmentPlanAction } from "@/server/actions/invoices";

export function PrintButton() {
  return <Button variant="outline" onClick={() => window.print()}><Printer /> طباعة / PDF</Button>;
}

export function InstallmentPlanDialog({ invoiceId, remaining }: { invoiceId: string; remaining: string }) {
  return (
    <FormDialog title="خطة تقسيط" description={`يُقسّط المتبقي على الفاتورة (${remaining}) على أقساط شهرية متساوية؛ آخر قسط يستوعب فروقات التقريب`} trigger="تقسيط" triggerVariant="outline" action={createInstallmentPlanAction} submitLabel="إنشاء الخطة">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Grid>
        <MoneyField name="downPayment" label="دفعة مقدمة ضمن الخطة" defaultValue="0" hint="تُستحق في تاريخ الفاتورة" />
        <NumberField name="count" label="عدد الأقساط" required min={1} max={360} defaultValue={12} />
        <DateField name="firstDueDate" label="تاريخ أول قسط" required />
      </Grid>
    </FormDialog>
  );
}
