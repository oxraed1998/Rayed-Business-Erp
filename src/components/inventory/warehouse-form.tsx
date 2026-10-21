"use client";
import { FormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/fields";
import { createWarehouseAction } from "@/server/actions/inventory";

export function NewWarehouseDialog() {
  return (
    <FormDialog title="مستودع جديد" trigger="مستودع" action={createWarehouseAction}>
      <TextField name="name" label="اسم المستودع" required placeholder="فرع جدة" />
      <TextField name="location" label="الموقع" />
    </FormDialog>
  );
}
