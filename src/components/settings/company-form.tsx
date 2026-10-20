"use client";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckboxField, Grid, SelectField, TextField } from "@/components/forms/fields";
import { createCompanyAction } from "@/server/actions/companies";
import type { Option } from "@/server/queries/options";

export function NewCompanyForm({ currencies }: { currencies: Option[] }) {
  return (
    <ActionForm action={createCompanyAction}>
      <Grid>
        <TextField name="name" label="اسم الشركة" required placeholder="شركة رائد للسيارات" />
        <TextField name="legalName" label="الاسم القانوني (اختياري)" />
        <TextField name="taxNumber" label="الرقم الضريبي (اختياري)" dir="ltr" placeholder="3XXXXXXXXXXXXX3" />
        <TextField name="crNumber" label="السجل التجاري (اختياري)" dir="ltr" />
        <SelectField name="baseCurrency" label="العملة الأساسية" options={currencies} defaultValue="SAR" required hint="تُسجّل القيود بهذه العملة؛ العمليات الأجنبية تُحوّل بسعر الصرف" />
      </Grid>
      <div className="rounded-xl border p-4">
        <p className="mb-3 text-sm font-bold">الأنشطة التجارية</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxField name="VEHICLES" label="استيراد وبيع السيارات" defaultChecked />
          <CheckboxField name="LIVESTOCK" label="استيراد وتربية وبيع المواشي" />
          <CheckboxField name="CLOTHING" label="استيراد وبيع الملابس" />
          <CheckboxField name="GENERAL" label="تجارة عامة" />
        </div>
      </div>
      <SubmitButton>إنشاء الشركة</SubmitButton>
    </ActionForm>
  );
}
