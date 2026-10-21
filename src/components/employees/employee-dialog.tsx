"use client";
import { FormDialog } from "@/components/forms/form-dialog";
import { DateField, Grid, MoneyField, SelectField, TextField } from "@/components/forms/fields";
import { createEmployeeAction, updateEmployeeAction } from "@/server/actions/employees";
import type { Option } from "@/server/queries/options";

export interface EmployeeDefaults {
  id: string; name: string; phone: string; email: string; nationalId: string; department: string; jobTitle: string;
  hireDate: string; salary: string; salaryCurrency: string; membershipId: string; status: string;
}

const STATUS: Option[] = [{ value: "ACTIVE", label: "على رأس العمل" }, { value: "ON_LEAVE", label: "في إجازة" }, { value: "TERMINATED", label: "منتهية خدمته" }];

export function EmployeeDialog({ members, currencies, showSalary, initial }: { members: Option[]; currencies: Option[]; showSalary: boolean; initial?: EmployeeDefaults }) {
  const edit = Boolean(initial);
  return (
    <FormDialog title={edit ? "تعديل بيانات الموظف" : "إضافة موظف"} trigger={edit ? "تعديل" : "موظف جديد"} triggerVariant={edit ? "ghost" : "default"} triggerSize={edit ? "sm" : undefined} icon={!edit}
      action={edit ? updateEmployeeAction : createEmployeeAction} wide>
      {edit && <input type="hidden" name="id" value={initial!.id} />}
      <Grid cols={3}>
        <TextField name="name" label="الاسم الكامل" required defaultValue={initial?.name} />
        <TextField name="phone" label="الجوال" dir="ltr" defaultValue={initial?.phone} />
        <TextField name="email" label="البريد الإلكتروني" dir="ltr" type="email" defaultValue={initial?.email} />
        <TextField name="nationalId" label="رقم الهوية / الإقامة" dir="ltr" defaultValue={initial?.nationalId} />
        <TextField name="department" label="القسم" defaultValue={initial?.department} />
        <TextField name="jobTitle" label="المسمى الوظيفي" defaultValue={initial?.jobTitle} />
        <DateField name="hireDate" label="تاريخ التعيين" defaultValue={initial?.hireDate} />
        {showSalary ? (
          <>
            <MoneyField name="salary" label="الراتب الشهري" defaultValue={initial?.salary} />
            <SelectField name="salaryCurrency" label="عملة الراتب" options={currencies} defaultValue={initial?.salaryCurrency ?? "SAR"} />
          </>
        ) : initial ? (
          <>
            <input type="hidden" name="salary" value={initial.salary} />
            <input type="hidden" name="salaryCurrency" value={initial.salaryCurrency} />
          </>
        ) : null}
        <SelectField name="membershipId" label="حساب المستخدم المرتبط" options={members} placeholder="بدون حساب" defaultValue={initial?.membershipId} hint="الصلاحيات تُدار من الإعدادات ← المستخدمون" />
        {edit && <SelectField name="status" label="الحالة الوظيفية" options={STATUS} defaultValue={initial?.status} />}
      </Grid>
    </FormDialog>
  );
}
