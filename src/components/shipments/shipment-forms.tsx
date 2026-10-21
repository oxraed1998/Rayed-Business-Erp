"use client";
import { FormDialog } from "@/components/forms/form-dialog";
import { CheckboxField, DateField, Grid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/forms/fields";
import { SettlementField } from "@/components/forms/settlement-field";
import { createShipmentAction, shipmentExpenseAction, shipmentStatusAction } from "@/server/actions/shipments";
import type { Option } from "@/server/queries/options";
import { today } from "@/lib/utils";

const TYPES: Option[] = [{ value: "VEHICLES", label: "سيارات" }, { value: "LIVESTOCK", label: "مواشي" }, { value: "CLOTHING", label: "ملابس" }, { value: "GENERAL", label: "عام" }];

export function NewShipmentDialog({ activities, methods }: { activities: Option[]; methods: Option[] }) {
  return (
    <FormDialog title="شحنة استيراد جديدة" description="المصاريف المشتركة (شحن، جمارك...) تُوزّع لاحقًا على بنود الشحنة" trigger="شحنة جديدة" action={createShipmentAction}>
      <Grid>
        <TextField name="reference" label="رقم / مرجع الشحنة" required dir="ltr" placeholder="BL-2026-001" />
        <SelectField name="type" label="نوع البضاعة" options={TYPES} required />
        <TextField name="originCountry" label="بلد المنشأ" />
        <SelectField name="allocationMethod" label="طريقة توزيع التكاليف" options={methods} required defaultValue="VALUE" hint="السيارات والمواشي: حسب القيمة أو الكمية" />
        <SelectField name="activityId" label="النشاط" options={activities} placeholder="بدون" />
        <DateField name="shippedAt" label="تاريخ الشحن" />
      </Grid>
      <TextAreaField name="notes" label="ملاحظات" rows={2} />
    </FormDialog>
  );
}

export function ShipmentExpenseDialog({ shipmentId, categories, cashAccounts, suppliers }: { shipmentId: string; categories: Option[]; cashAccounts: Option[]; suppliers: Option[] }) {
  return (
    <FormDialog title="مصروف مشترك للشحنة" description="يُسجَّل في حساب بضاعة في الطريق حتى يتم توزيعه" trigger="مصروف" triggerSize="sm" action={shipmentExpenseAction}>
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <Grid>
        <SelectField name="category" label="نوع المصروف" options={categories} required />
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
        <MoneyField name="amount" label="المبلغ قبل الضريبة" required />
        <MoneyField name="vatAmount" label="ضريبة القيمة المضافة" />
      </Grid>
      <CheckboxField name="vatRecoverable" label="الضريبة قابلة للاسترداد" defaultChecked />
      <TextField name="description" label="الوصف" />
      <SettlementField cashAccounts={cashAccounts} suppliers={suppliers} />
    </FormDialog>
  );
}

export function ShipmentStatusDialog({ shipmentId, options }: { shipmentId: string; options: Option[] }) {
  if (!options.length) return null;
  return (
    <FormDialog title="تحديث حالة الشحنة" trigger="تغيير الحالة" triggerVariant="outline" triggerSize="sm" icon={false} action={shipmentStatusAction}>
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <SelectField name="status" label="الحالة الجديدة" options={options} required />
      <DateField name="arrivedAt" label="تاريخ الوصول (عند اختيار وصلت)" />
    </FormDialog>
  );
}
