"use client";
import { FormDialog } from "@/components/forms/form-dialog";
import { DateField, Grid, TextField } from "@/components/forms/fields";
import { createPeriodAction } from "@/server/actions/accounting";

export function NewPeriodDialog() {
  const y = new Date().getFullYear() + 1;
  return (
    <FormDialog title="إضافة فترة مالية" trigger="فترة جديدة" action={createPeriodAction}>
      <TextField name="name" label="اسم الفترة" required defaultValue={`السنة المالية ${y}`} />
      <Grid>
        <DateField name="startDate" label="من" required defaultValue={`${y}-01-01`} />
        <DateField name="endDate" label="إلى" required defaultValue={`${y}-12-31`} />
      </Grid>
    </FormDialog>
  );
}
