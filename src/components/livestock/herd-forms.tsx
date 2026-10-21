"use client";
import { FormDialog } from "@/components/forms/form-dialog";
import { CheckboxField, DateField, Grid, MoneyField, NumberField, SelectField, TextAreaField, TextField } from "@/components/forms/fields";
import { SettlementField } from "@/components/forms/settlement-field";
import { createHerdAction, herdBirthAction, herdDeathAction, herdExpenseAction, herdPurchaseAction, herdSaleAction, herdWeighingAction } from "@/server/actions/livestock";
import type { Option } from "@/server/queries/options";
import { today } from "@/lib/utils";

export function NewHerdDialog({ activities, shipments }: { activities: Option[]; shipments: Option[] }) {
  return (
    <FormDialog title="قطيع جديد" description="أنشئ القطيع ثم سجّل الشراء أو الاستيراد" trigger="قطيع جديد" action={createHerdAction}>
      <Grid>
        <TextField name="name" label="اسم القطيع / الدفعة" required placeholder="دفعة أستراليا 2026" />
        <TextField name="species" label="النوع" required placeholder="أغنام" />
        <TextField name="breed" label="السلالة" placeholder="نعيمي" />
        <TextField name="location" label="الموقع / الحظيرة" />
        <SelectField name="activityId" label="النشاط" options={activities} />
        <SelectField name="shipmentId" label="شحنة الاستيراد" options={shipments} placeholder="بدون شحنة" />
      </Grid>
      <TextAreaField name="notes" label="ملاحظات" rows={2} />
    </FormDialog>
  );
}

const Herd = ({ id }: { id: string }) => <input type="hidden" name="herdId" value={id} />;

export function HerdPurchaseDialog({ herdId, cashAccounts, suppliers }: { herdId: string; cashAccounts: Option[]; suppliers: Option[] }) {
  return (
    <FormDialog title="شراء / استيراد رؤوس" description="تُضاف التكلفة إلى مخزون المواشي" trigger="شراء" triggerSize="sm" action={herdPurchaseAction}>
      <Herd id={herdId} />
      <Grid>
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
        <NumberField name="quantity" label="عدد الرؤوس" required min={1} />
        <MoneyField name="amount" label="إجمالي تكلفة الشراء" required className="sm:col-span-2" />
      </Grid>
      <SettlementField cashAccounts={cashAccounts} suppliers={suppliers} />
      <TextField name="note" label="ملاحظة" />
    </FormDialog>
  );
}

export function HerdExpenseDialog({ herdId, categories, cashAccounts, suppliers }: { herdId: string; categories: Option[]; cashAccounts: Option[]; suppliers: Option[] }) {
  return (
    <FormDialog title="مصروف رعاية" description="يُرسمَل ضمن تكلفة القطيع ويُوزّع على الرؤوس المتبقية" trigger="مصروف" triggerVariant="outline" triggerSize="sm" action={herdExpenseAction}>
      <Herd id={herdId} />
      <Grid>
        <SelectField name="category" label="نوع المصروف" options={categories} required />
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
        <MoneyField name="amount" label="المبلغ قبل الضريبة" required />
        <MoneyField name="vatAmount" label="ضريبة القيمة المضافة" />
      </Grid>
      <CheckboxField name="vatRecoverable" label="الضريبة قابلة للاسترداد" defaultChecked hint="ألغِ التحديد لإضافة الضريبة إلى التكلفة" />
      <TextField name="description" label="الوصف" />
      <SettlementField cashAccounts={cashAccounts} suppliers={suppliers} />
    </FormDialog>
  );
}

export function HerdBirthDialog({ herdId }: { herdId: string }) {
  return (
    <FormDialog title="تسجيل مواليد" description="المواليد تزيد العدد دون تكلفة إضافية، فتنخفض تكلفة الرأس" trigger="مواليد" triggerVariant="outline" triggerSize="sm" action={herdBirthAction}>
      <Herd id={herdId} />
      <Grid><DateField name="date" label="التاريخ" required defaultValue={today()} /><NumberField name="quantity" label="العدد" required min={1} /></Grid>
      <TextField name="note" label="ملاحظة" />
    </FormDialog>
  );
}

export function HerdDeathDialog({ herdId, remaining }: { herdId: string; remaining: number }) {
  return (
    <FormDialog title="تسجيل نفوق" description="تُحمّل تكلفة الرؤوس النافقة (بمتوسط التكلفة) على مصروف النفوق" trigger="نفوق" triggerVariant="outline" triggerSize="sm" action={herdDeathAction}>
      <Herd id={herdId} />
      <Grid><DateField name="date" label="التاريخ" required defaultValue={today()} /><NumberField name="quantity" label="العدد" required min={1} max={remaining} hint={`المتبقي ${remaining}`} /></Grid>
      <TextField name="note" label="السبب / ملاحظة" />
    </FormDialog>
  );
}

export function HerdWeighingDialog({ herdId }: { herdId: string }) {
  return (
    <FormDialog title="تسجيل وزن" trigger="وزن" triggerVariant="outline" triggerSize="sm" action={herdWeighingAction}>
      <Herd id={herdId} />
      <Grid cols={3}>
        <DateField name="date" label="التاريخ" required defaultValue={today()} />
        <NumberField name="quantity" label="عدد الرؤوس الموزونة" required min={0} defaultValue={0} />
        <MoneyField name="avgWeightKg" label="متوسط الوزن (كجم)" required />
      </Grid>
      <TextField name="note" label="ملاحظة" />
    </FormDialog>
  );
}

export function HerdSaleDialog({ herdId, remaining, customers, cashAccounts, vatRate }: { herdId: string; remaining: number; customers: Option[]; cashAccounts: Option[]; vatRate: string }) {
  return (
    <FormDialog title="بيع من القطيع" description="تُصدر فاتورة مبيعات مرحّلة وتُنقل تكلفة الرؤوس المباعة إلى تكلفة المبيعات" trigger="بيع" triggerVariant="gold" triggerSize="sm" icon={false} action={herdSaleAction} submitLabel="تأكيد البيع">
      <Herd id={herdId} />
      <Grid>
        <SelectField name="customerId" label="العميل" options={customers} required placeholder="اختر العميل" />
        <DateField name="date" label="تاريخ البيع" required defaultValue={today()} />
        <NumberField name="quantity" label="عدد الرؤوس" required min={1} max={remaining} hint={`المتبقي ${remaining}`} />
        <MoneyField name="unitPrice" label="سعر الرأس قبل الضريبة" required />
        <MoneyField name="vatRate" label="نسبة الضريبة %" required defaultValue={vatRate} />
      </Grid>
      <div className="rounded-xl border p-4">
        <p className="mb-3 text-sm font-bold">المبلغ المستلم الآن (اختياري)</p>
        <Grid><MoneyField name="paidAmount" label="المبلغ" /><SelectField name="paidAccountId" label="إلى حساب" options={cashAccounts} placeholder="اختر" /></Grid>
      </div>
    </FormDialog>
  );
}
