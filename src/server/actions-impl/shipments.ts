import "server-only";
import { z } from "zod";
import { companyAction } from "@/server/action";
import { addShipmentExpense, allocateShipment, createShipment } from "@/server/services/vehicles";
import { setShipmentStatus } from "@/server/services/shipments";
import { zBool, zDate, zId, zNonNegMoney, zOptId, zOptText, zPositiveMoney, zText } from "@/server/services/actor";

const settlement = z.object({ accountId: z.string().min(1, "اختر طريقة السداد"), supplierId: zOptId });

export const createShipmentAction = companyAction(
  {
    permission: "inventory.manage",
    schema: z.object({
      reference: zText(60), type: z.enum(["VEHICLES", "LIVESTOCK", "CLOTHING", "GENERAL"]), originCountry: zOptText(60),
      allocationMethod: z.enum(["QUANTITY", "VALUE", "WEIGHT", "VOLUME"]), activityId: zOptId, shippedAt: zDate.optional(), notes: zOptText(1000),
    }),
  },
  async ({ tx, data, actor }) => {
    const s = await createShipment(tx, actor, { ...data, reference: data.reference.toUpperCase(), shippedAt: data.shippedAt ?? null });
    return { message: "تم إنشاء الشحنة", redirect: `/shipments/${s.id}` };
  },
);

export const shipmentExpenseAction = companyAction(
  {
    permission: "inventory.manage",
    schema: z.object({ shipmentId: zId, category: zText(40), description: zOptText(300), amount: zPositiveMoney, vatAmount: zNonNegMoney.optional(), vatRecoverable: zBool, date: zDate, settlement }),
  },
  async ({ tx, data, actor }) => {
    await addShipmentExpense(tx, actor, data);
    return "تم تسجيل مصروف الشحنة (بضاعة في الطريق)";
  },
);

export const allocateShipmentAction = companyAction(
  { permission: "inventory.manage", schema: z.object({ shipmentId: zId }) },
  async ({ tx, data, actor }) => {
    await allocateShipment(tx, actor, data.shipmentId);
    return "تم توزيع المصاريف على بنود الشحنة";
  },
);

export const shipmentStatusAction = companyAction(
  { permission: "inventory.manage", schema: z.object({ shipmentId: zId, status: z.enum(["IN_TRANSIT", "CUSTOMS", "ARRIVED", "CLOSED"]), arrivedAt: zDate.optional() }) },
  async ({ tx, data, actor }) => {
    await setShipmentStatus(tx, actor, data.shipmentId, data.status, data.arrivedAt);
    return "تم تحديث حالة الشحنة";
  },
);
