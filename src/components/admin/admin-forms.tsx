"use client";
import { FormDialog } from "@/components/forms/form-dialog";
import { DateField, Grid, MoneyField, NumberField, SelectField, TextField } from "@/components/forms/fields";
import { updatePlanAction, updateSubscriptionAction } from "@/server/actions/admin";
import { PLAN_OPTS, STATUS_OPTS } from "./plan-options";

export function SubscriptionDialog({ tenantId, tenantName, plan, status, expiresAt, note }: { tenantId: string; tenantName: string; plan: string; status: string; expiresAt: string; note: string }) {
  return (
    <FormDialog title={`اشتراك ${tenantName}`} description="تغيير يدوي للاشتراك — لا يتم تحصيل أي مبالغ (الدفع غير مفعّل)" trigger="الاشتراك" triggerVariant="outline" triggerSize="sm" icon={false} action={updateSubscriptionAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <Grid>
        <SelectField name="plan" label="الباقة" options={PLAN_OPTS} defaultValue={plan} required />
        <SelectField name="status" label="الحالة" options={STATUS_OPTS} defaultValue={status} required />
        <DateField name="expiresAt" label="تاريخ الانتهاء" defaultValue={expiresAt} hint="اتركه فارغًا لاشتراك بلا انتهاء" />
        <TextField name="billingNote" label="ملاحظة الفوترة" defaultValue={note} />
      </Grid>
    </FormDialog>
  );
}

export function PlanDialog({ code, name, maxCompanies, maxUsers, price }: { code: string; name: string; maxCompanies: number; maxUsers: number; price: string }) {
  return (
    <FormDialog title={`باقة ${name}`} trigger="تعديل" triggerVariant="outline" triggerSize="sm" icon={false} action={updatePlanAction}>
      <input type="hidden" name="code" value={code} />
      <Grid cols={3}>
        <NumberField name="maxCompanies" label="حد الشركات" min={1} required defaultValue={maxCompanies} />
        <NumberField name="maxUsers" label="حد المستخدمين" min={1} required defaultValue={maxUsers} />
        <MoneyField name="monthlyPrice" label="السعر الشهري (SAR)" required defaultValue={price} />
      </Grid>
    </FormDialog>
  );
}
