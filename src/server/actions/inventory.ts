"use server";
import { z } from "zod";
import { companyAction } from "@/server/action";
import { adjustStock, createProduct, receiveStock, returnFromCustomer, sellStock, transferStock } from "@/server/services/inventory";
import { ServiceError, zCurrency, zDate, zId, zMoney, zNonNegMoney, zOptId, zOptText, zPositiveMoney, zRate, zText } from "@/server/services/actor";
import { audit } from "@/lib/audit";

const settlement = z.object({ accountId: z.string().min(1, "اختر طريقة السداد"), supplierId: zOptId });
const zQty = z.union([z.string(), z.number()]).transform((v) => String(v).trim()).refine((v) => /^\d{1,12}(\.\d{1,3})?$/.test(v) && Number(v) > 0, "كمية غير صالحة");
const zOptDecimal = z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === undefined || v === null || v === "" ? null : String(v)))
  .refine((v) => v === null || /^\d{1,8}(\.\d{1,4})?$/.test(v), "قيمة غير صالحة");

export const createProductAction = companyAction(
  {
    permission: "clothing.create",
    schema: z.object({
      name: zText(150), category: zOptText(80), brand: zOptText(80), activityId: zOptId,
      variants: z.array(z.object({
        sku: zText(60), barcode: zOptText(60), size: zOptText(20), color: zOptText(40), sellingPrice: zNonNegMoney.default("0"),
        reorderLevel: z.coerce.number().int().min(0).max(1_000_000).default(0), weightKg: zOptDecimal, volumeM3: zOptDecimal,
      })).min(1, "أضف مقاسًا/لونًا واحدًا على الأقل"),
    }),
  },
  async ({ tx, data, actor }) => {
    const p = await createProduct(tx, actor, { ...data, variants: data.variants.map((v) => ({ ...v, sku: v.sku.toUpperCase() })) });
    return { message: "تمت إضافة المنتج", redirect: `/clothing/${p.id}` };
  },
);

export const receiveStockAction = companyAction(
  {
    permission: "inventory.manage",
    schema: z.object({ variantId: zId, warehouseId: zId, quantity: zQty, unitCost: zPositiveMoney, currency: zCurrency, fxRate: zRate, date: zDate, shipmentId: zOptId, settlement, note: zOptText(300) }),
  },
  async ({ tx, data, actor }) => {
    await receiveStock(tx, actor, data);
    return "تم استلام البضاعة وترحيل القيد";
  },
);

export const sellStockAction = companyAction(
  {
    permission: "invoices.create",
    schema: z.object({
      customerId: z.string().min(1, "اختر العميل"), warehouseId: zId, date: zDate, vatRate: z.coerce.number().min(0).max(100),
      lines: z.array(z.object({ variantId: zId, quantity: zQty, unitPrice: zPositiveMoney, discount: zNonNegMoney.optional() })).min(1, "أضف صنفًا واحدًا على الأقل"),
      paidAmount: zNonNegMoney.optional(), paidAccountId: zOptId,
    }),
  },
  async ({ tx, data, actor }) => {
    const paid = data.paidAmount && Number(data.paidAmount) > 0;
    if (paid && !data.paidAccountId) throw new ServiceError("اختر حساب الاستلام للمبلغ المدفوع");
    const inv = await sellStock(tx, actor, { ...data, paidNow: paid ? { amount: data.paidAmount!, accountId: data.paidAccountId! } : null });
    return { message: `تم البيع وإصدار الفاتورة ${inv.number}`, redirect: `/invoices/${inv.id}` };
  },
);

export const returnStockAction = companyAction(
  {
    permission: "invoices.create",
    schema: z.object({ invoiceId: zId, warehouseId: zId, date: zDate, variantId: zId, quantity: zQty, unitPrice: zPositiveMoney, vatRate: z.coerce.number().min(0).max(100) }),
  },
  async ({ tx, data, actor }) => {
    const cn = await returnFromCustomer(tx, actor, data);
    return `تم تسجيل المرتجع وإصدار الإشعار الدائن ${cn.number}`;
  },
);

export const adjustStockAction = companyAction(
  {
    permission: "inventory.manage",
    schema: z.object({ variantId: zId, warehouseId: zId, quantity: zMoney.refine((v) => Number(v) !== 0, "الكمية لا يمكن أن تكون صفرًا"), unitCost: zNonNegMoney.optional(), date: zDate, note: zText(300) }),
  },
  async ({ tx, data, actor }) => {
    await adjustStock(tx, actor, data);
    return "تم تسجيل التسوية";
  },
);

export const transferStockAction = companyAction(
  { permission: "inventory.manage", schema: z.object({ variantId: zId, fromWarehouseId: zId, toWarehouseId: zId, quantity: zQty, date: zDate, note: zOptText(300) }) },
  async ({ tx, data, actor }) => {
    await transferStock(tx, actor, data);
    return "تم تحويل الكمية بين المستودعات";
  },
);

export const createWarehouseAction = companyAction(
  { permission: "inventory.manage", schema: z.object({ name: zText(100), location: zOptText(200) }) },
  async ({ tx, data, actor }) => {
    const w = await tx.warehouse.create({ data: { tenantId: actor.tenantId, companyId: actor.companyId, ...data } });
    await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "Warehouse", entityId: w.id, data });
    return "تمت إضافة المستودع";
  },
);
