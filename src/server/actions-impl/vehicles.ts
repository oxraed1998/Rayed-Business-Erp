import "server-only";
import { z } from "zod";
import { companyAction } from "@/server/action";
import { addVehicleExpense, createVehicle, sellVehicle, setVehicleStatus } from "@/server/services/vehicles";
import { ServiceError, zBool, zCurrency, zDate, zId, zInt, zNonNegMoney, zOptId, zOptText, zPositiveMoney, zRate, zText } from "@/server/services/actor";

const settlement = z.object({ accountId: z.string().min(1, "اختر طريقة السداد"), supplierId: zOptId });

export const createVehicleAction = companyAction(
  {
    permission: "vehicles.create",
    schema: z.object({
      manufacturer: zText(60), model: zText(60), year: zInt(1950, 2100), vin: zOptText(32), color: zOptText(30),
      mileage: z.coerce.number().int().min(0).max(5_000_000).optional(), originCountry: zOptText(60), importCountry: zOptText(60),
      purchaseDate: zDate, purchaseCurrency: zCurrency, purchasePrice: zPositiveMoney, exchangeRate: zRate,
      activityId: zOptId, shipmentId: zOptId, supplierId: zOptId, notes: zOptText(1000), settlement,
    }),
  },
  async ({ tx, data, actor }) => {
    const v = await createVehicle(tx, actor, { ...data, vin: data.vin?.toUpperCase() ?? null });
    return { message: "تمت إضافة السيارة وترحيل قيد الشراء", redirect: `/vehicles/${v.id}` };
  },
);

export const addVehicleExpenseAction = companyAction(
  {
    permission: "vehicles.update",
    schema: z.object({ vehicleId: zId, category: zText(40), description: zOptText(300), amount: zPositiveMoney, vatAmount: zNonNegMoney.optional(), vatRecoverable: zBool, date: zDate, settlement }),
  },
  async ({ tx, data, actor }) => {
    await addVehicleExpense(tx, actor, data);
    return "تم تسجيل المصروف وإضافته لتكلفة السيارة";
  },
);

export const setVehicleStatusAction = companyAction(
  { permission: "vehicles.update", schema: z.object({ vehicleId: zId, status: z.enum(["IN_TRANSIT", "CUSTOMS", "IN_STOCK", "RESERVED"]), deposit: zNonNegMoney.optional() }) },
  async ({ tx, data, actor }) => {
    await setVehicleStatus(tx, actor, data.vehicleId, data.status, data.deposit);
    return "تم تحديث الحالة";
  },
);

export const sellVehicleAction = companyAction(
  {
    permission: "invoices.create",
    schema: z.object({
      vehicleId: zId, customerId: z.string().min(1, "اختر العميل"), saleDate: zDate, price: zPositiveMoney, vatRate: z.coerce.number().min(0).max(100),
      paidAmount: zNonNegMoney.optional(), paidAccountId: zOptId, method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"]).default("CASH"),
      installmentCount: z.coerce.number().int().min(0).max(120).optional(), firstDueDate: zDate.optional(),
    }),
  },
  async ({ tx, data, actor }) => {
    const paid = data.paidAmount && Number(data.paidAmount) > 0;
    if (paid && !data.paidAccountId) throw new ServiceError("اختر حساب الاستلام للدفعة المقدمة");
    const { invoice, profit } = await sellVehicle(tx, actor, {
      vehicleId: data.vehicleId, customerId: data.customerId, saleDate: data.saleDate, price: data.price, vatRate: data.vatRate,
      paidNow: paid ? { amount: data.paidAmount!, accountId: data.paidAccountId!, method: data.method } : null,
      installments: data.installmentCount && data.installmentCount > 0 ? { count: data.installmentCount, firstDueDate: data.firstDueDate ?? new Date() } : null,
    });
    return { message: `تم البيع وإصدار الفاتورة ${invoice.number} · الربح ${profit.toFixed(2)}`, redirect: `/invoices/${invoice.id}` };
  },
);
