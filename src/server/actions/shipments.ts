"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/shipments";

export async function createShipmentAction(...args: Parameters<typeof impl.createShipmentAction>) {
  return impl.createShipmentAction(...args);
}

export async function shipmentExpenseAction(...args: Parameters<typeof impl.shipmentExpenseAction>) {
  return impl.shipmentExpenseAction(...args);
}

export async function allocateShipmentAction(...args: Parameters<typeof impl.allocateShipmentAction>) {
  return impl.allocateShipmentAction(...args);
}

export async function shipmentStatusAction(...args: Parameters<typeof impl.shipmentStatusAction>) {
  return impl.shipmentStatusAction(...args);
}
