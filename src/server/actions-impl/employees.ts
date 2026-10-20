import "server-only";
import { z } from "zod";
import { companyAction } from "@/server/action";
import { createEmployee, updateEmployee } from "@/server/services/employees";
import { zCurrency, zDate, zId, zNonNegMoney, zOptId, zOptText, zText } from "@/server/services/actor";

const employeeSchema = z.object({
  name: zText(150), phone: zOptText(30), email: zOptText(254), nationalId: zOptText(30), department: zOptText(100), jobTitle: zOptText(100),
  hireDate: zDate.optional().nullable(), salary: zNonNegMoney.optional().nullable(), salaryCurrency: zCurrency.default("SAR"), membershipId: zOptId,
});

export const createEmployeeAction = companyAction({ permission: "employees.manage", schema: employeeSchema }, async ({ tx, data, actor }) => {
  const e = await createEmployee(tx, actor, data);
  return `تمت إضافة الموظف ${e.name}`;
});

export const updateEmployeeAction = companyAction(
  { permission: "employees.manage", schema: employeeSchema.extend({ id: zId, status: z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED"]) }) },
  async ({ tx, data, actor }) => {
    await updateEmployee(tx, actor, data.id, data);
    return "تم تحديث بيانات الموظف";
  },
);
