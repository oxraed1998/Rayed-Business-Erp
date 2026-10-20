import type { ShipmentStatus } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NotFound, ServiceError, type Actor } from "./actor";

const ORDER: ShipmentStatus[] = ["ORDERED", "IN_TRANSIT", "CUSTOMS", "ARRIVED", "CLOSED"];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  ORDERED: "تم الطلب", IN_TRANSIT: "في الطريق", CUSTOMS: "في الجمارك", ARRIVED: "وصلت", CLOSED: "مغلقة",
};

/** Moves a shipment forward through its lifecycle. Closing requires all expenses allocated. */
export async function setShipmentStatus(tx: Tx, actor: Actor, shipmentId: string, status: ShipmentStatus, arrivedAt?: Date | null) {
  const s = await tx.importShipment.findFirst({ where: { id: shipmentId, tenantId: actor.tenantId, companyId: actor.companyId }, include: { expenses: { where: { allocatedAt: null } } } });
  if (!s) throw NotFound("الشحنة");
  if (s.status === "CLOSED") throw new ServiceError("الشحنة مغلقة");
  if (ORDER.indexOf(status) <= ORDER.indexOf(s.status)) throw new ServiceError("لا يمكن إرجاع حالة الشحنة للخلف");
  if (status === "CLOSED" && s.expenses.length) throw new ServiceError("وزّع مصاريف الشحنة قبل إغلاقها");
  await tx.importShipment.update({
    where: { id: s.id },
    data: { status, ...(status === "IN_TRANSIT" && !s.shippedAt ? { shippedAt: new Date() } : {}), ...(status === "ARRIVED" ? { arrivedAt: arrivedAt ?? new Date() } : {}) },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "status", entity: "ImportShipment", entityId: s.id, data: { from: s.status, to: status } });
}
