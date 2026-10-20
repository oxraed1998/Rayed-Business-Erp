"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/vehicles";

export async function createVehicleAction(...args: Parameters<typeof impl.createVehicleAction>) {
  return impl.createVehicleAction(...args);
}

export async function addVehicleExpenseAction(...args: Parameters<typeof impl.addVehicleExpenseAction>) {
  return impl.addVehicleExpenseAction(...args);
}

export async function setVehicleStatusAction(...args: Parameters<typeof impl.setVehicleStatusAction>) {
  return impl.setVehicleStatusAction(...args);
}

export async function sellVehicleAction(...args: Parameters<typeof impl.sellVehicleAction>) {
  return impl.sellVehicleAction(...args);
}
