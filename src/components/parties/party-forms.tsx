"use client";
import { FormDialog } from "@/components/forms/form-dialog";
import { Grid, TextAreaField, TextField } from "@/components/forms/fields";
import { saveCustomerAction, saveSupplierAction } from "@/server/actions/parties";

type Customer = { id: string; name: string; phone: string | null; email: string | null; address: string | null; taxNumber: string | null; companyName: string | null; notes: string | null };
type Supplier = { id: string; name: string; country: string | null; phone: string | null; email: string | null; address: string | null; taxNumber: string | null; bankName: string | null; iban: string | null; notes: string | null };

export function CustomerDialog({ customer }: { customer?: Customer }) {
  return (
    <FormDialog title={customer ? "تعديل بيانات العميل" : "إضافة عميل"} trigger={customer ? "تعديل" : "عميل جديد"} triggerVariant={customer ? "outline" : "default"} triggerSize={customer ? "sm" : undefined} icon={!customer} action={saveCustomerAction}>
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <Grid>
        <TextField name="name" label="الاسم" required defaultValue={customer?.name} />
        <TextField name="phone" label="الجوال" dir="ltr" defaultValue={customer?.phone ?? ""} placeholder="05XXXXXXXX" />
        <TextField name="email" label="البريد الإلكتروني" type="email" dir="ltr" defaultValue={customer?.email ?? ""} />
        <TextField name="companyName" label="اسم المنشأة (إن وجد)" defaultValue={customer?.companyName ?? ""} />
        <TextField name="taxNumber" label="الرقم الضريبي" dir="ltr" defaultValue={customer?.taxNumber ?? ""} placeholder="3XXXXXXXXXXXXX3" />
        <TextField name="address" label="العنوان" defaultValue={customer?.address ?? ""} />
      </Grid>
      <TextAreaField name="notes" label="ملاحظات" rows={2} defaultValue={customer?.notes ?? ""} />
    </FormDialog>
  );
}

export function SupplierDialog({ supplier }: { supplier?: Supplier }) {
  return (
    <FormDialog title={supplier ? "تعديل بيانات المورد" : "إضافة مورد"} trigger={supplier ? "تعديل" : "مورد جديد"} triggerVariant={supplier ? "outline" : "default"} triggerSize={supplier ? "sm" : undefined} icon={!supplier} action={saveSupplierAction} wide>
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      <Grid cols={3}>
        <TextField name="name" label="الاسم" required defaultValue={supplier?.name} />
        <TextField name="country" label="الدولة" defaultValue={supplier?.country ?? ""} placeholder="كوريا الجنوبية" />
        <TextField name="phone" label="الهاتف" dir="ltr" defaultValue={supplier?.phone ?? ""} />
        <TextField name="email" label="البريد الإلكتروني" type="email" dir="ltr" defaultValue={supplier?.email ?? ""} />
        <TextField name="taxNumber" label="الرقم الضريبي" dir="ltr" defaultValue={supplier?.taxNumber ?? ""} />
        <TextField name="address" label="العنوان" defaultValue={supplier?.address ?? ""} />
        <TextField name="bankName" label="اسم البنك" defaultValue={supplier?.bankName ?? ""} />
        <TextField name="iban" label="IBAN" dir="ltr" className="sm:col-span-2" defaultValue={supplier?.iban ?? ""} placeholder="SA0000000000000000000000" />
      </Grid>
      <TextAreaField name="notes" label="ملاحظات" rows={2} defaultValue={supplier?.notes ?? ""} />
    </FormDialog>
  );
}
