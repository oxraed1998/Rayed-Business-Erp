"use client";
import { useState } from "react";
import { FormDialog } from "@/components/forms/form-dialog";
import { DateField, Grid, MoneyField, NumberField, SelectField, TextAreaField, TextField } from "@/components/forms/fields";
import { createContractAction, updateContractAction } from "@/server/actions/contracts";
import type { Option } from "@/server/queries/options";
import { today } from "@/lib/utils";

export interface ContractDefaults {
  id?: string; type: string; title: string; parties: string; startDate: string; endDate: string; value: string; currency: string;
  paymentTerms: string; body: string; renewalReminderDays: number;
}

export function ContractDialog({ types, currencies, templates, initial }: { types: Option[]; currencies: Option[]; templates: Record<string, string>; initial?: ContractDefaults }) {
  const [type, setType] = useState(initial?.type ?? types[0]?.value ?? "SALES");
  const [body, setBody] = useState(initial?.body ?? templates[type] ?? "");
  const [touched, setTouched] = useState(Boolean(initial));
  const edit = Boolean(initial?.id);
  return (
    <FormDialog title={edit ? "تعديل العقد" : "عقد جديد"} description={edit ? "التعديل متاح ما دام العقد مسودة" : "يُرقّم العقد تلقائيًا ويبدأ كمسودة، ثم يُرسل للاعتماد"}
      trigger={edit ? "تعديل" : "عقد جديد"} triggerVariant={edit ? "outline" : "default"} triggerSize={edit ? "sm" : undefined} icon={!edit} action={edit ? updateContractAction : createContractAction} wide>
      {edit && <input type="hidden" name="id" value={initial!.id} />}
      <Grid cols={3}>
        <SelectField name="type" label="نوع العقد" options={types} value={type} required
          onChange={(e) => { setType(e.target.value); if (!touched) setBody(templates[e.target.value] ?? ""); }} />
        <TextField name="title" label="عنوان العقد" required defaultValue={initial?.title} className="sm:col-span-2" />
      </Grid>
      <TextAreaField name="parties" label="أطراف العقد" required rows={2} defaultValue={initial?.parties} placeholder="الطرف الأول: ... · الطرف الثاني: ..." />
      <Grid cols={4}>
        <DateField name="startDate" label="تاريخ البداية" required defaultValue={initial?.startDate ?? today()} />
        <DateField name="endDate" label="تاريخ النهاية" defaultValue={initial?.endDate} />
        <MoneyField name="value" label="قيمة العقد" defaultValue={initial?.value} />
        <SelectField name="currency" label="العملة" options={currencies} defaultValue={initial?.currency ?? "SAR"} />
      </Grid>
      <Grid>
        <TextAreaField name="paymentTerms" label="شروط الدفع" rows={2} defaultValue={initial?.paymentTerms} />
        <NumberField name="renewalReminderDays" label="تذكير التجديد قبل (يوم)" min={0} max={365} defaultValue={initial?.renewalReminderDays ?? 30} />
      </Grid>
      <div className="space-y-1.5">
        <label className="text-[13px] font-semibold">نص العقد {!edit && <span className="text-xs font-normal text-muted-foreground">(قالب جاهز حسب النوع، عدّله قبل الاعتماد)</span>}</label>
        <textarea name="body" rows={10} value={body} onChange={(e) => { setBody(e.target.value); setTouched(true); }}
          className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm leading-7 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />
      </div>
    </FormDialog>
  );
}
