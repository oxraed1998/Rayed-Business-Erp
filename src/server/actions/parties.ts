"use server";
import { z } from "zod";
import { companyAction } from "@/server/action";
import { audit } from "@/lib/audit";
import { NotFound, ServiceError, zOptText, zText } from "@/server/services/actor";

const email = z.string().trim().max(254).email("بريد إلكتروني غير صالح").optional().nullable().or(z.literal("").transform(() => null)).transform((v) => v || null);
const taxNumber = zOptText(30).refine((v) => !v || /^3\d{13}3$/.test(v), "الرقم الضريبي السعودي يتكون من 15 رقمًا ويبدأ وينتهي بالرقم 3");

const customerSchema = z.object({
  id: z.string().max(40).optional(),
  name: zText(200), phone: zOptText(30), email, address: zOptText(300), taxNumber, companyName: zOptText(200), notes: zOptText(1000),
});

export const saveCustomerAction = companyAction({ permission: "customers.manage", schema: customerSchema }, async ({ tx, data, actor }) => {
  const { id, ...fields } = data;
  if (id) {
    const c = await tx.customer.findFirst({ where: { id, tenantId: actor.tenantId, companyId: actor.companyId } });
    if (!c) throw NotFound("العميل");
    await tx.customer.update({ where: { id: c.id }, data: fields });
    await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "update", entity: "Customer", entityId: c.id, data: fields });
    return "تم تحديث بيانات العميل";
  }
  const c = await tx.customer.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, ...fields } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "Customer", entityId: c.id, data: { name: c.name } });
  return { message: "تمت إضافة العميل", redirect: `/customers/${c.id}` };
});

const supplierSchema = z.object({
  id: z.string().max(40).optional(),
  name: zText(200), country: zOptText(60), phone: zOptText(30), email, address: zOptText(300),
  taxNumber: zOptText(30), bankName: zOptText(100),
  iban: zOptText(40).transform((v) => (v ? v.replace(/\s+/g, "").toUpperCase() : null)).refine((v) => !v || /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(v), "رقم IBAN غير صالح"),
  notes: zOptText(1000),
});

export const saveSupplierAction = companyAction({ permission: "suppliers.manage", schema: supplierSchema }, async ({ tx, data, actor }) => {
  const { id, ...fields } = data;
  if (fields.country && fields.country.length < 2) throw new ServiceError("اسم الدولة غير صالح");
  if (id) {
    const s = await tx.supplier.findFirst({ where: { id, tenantId: actor.tenantId, companyId: actor.companyId } });
    if (!s) throw NotFound("المورد");
    await tx.supplier.update({ where: { id: s.id }, data: fields });
    await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "update", entity: "Supplier", entityId: s.id, data: fields });
    return "تم تحديث بيانات المورد";
  }
  const s = await tx.supplier.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, ...fields } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "Supplier", entityId: s.id, data: { name: s.name } });
  return { message: "تمت إضافة المورد", redirect: `/suppliers/${s.id}` };
});
