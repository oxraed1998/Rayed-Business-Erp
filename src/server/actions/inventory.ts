"use server";
// Server Action entry points. Implementations live in src/server/actions-impl
// (Next.js only allows async functions in "use server" modules).
import * as impl from "@/server/actions-impl/inventory";

export async function createProductAction(...args: Parameters<typeof impl.createProductAction>) {
  return impl.createProductAction(...args);
}

export async function receiveStockAction(...args: Parameters<typeof impl.receiveStockAction>) {
  return impl.receiveStockAction(...args);
}

export async function sellStockAction(...args: Parameters<typeof impl.sellStockAction>) {
  return impl.sellStockAction(...args);
}

export async function returnStockAction(...args: Parameters<typeof impl.returnStockAction>) {
  return impl.returnStockAction(...args);
}

export async function adjustStockAction(...args: Parameters<typeof impl.adjustStockAction>) {
  return impl.adjustStockAction(...args);
}

export async function transferStockAction(...args: Parameters<typeof impl.transferStockAction>) {
  return impl.transferStockAction(...args);
}

export async function createWarehouseAction(...args: Parameters<typeof impl.createWarehouseAction>) {
  return impl.createWarehouseAction(...args);
}
