import "server-only";
import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/context";

export type Option = { value: string; label: string };

const scope = (ctx: CompanyContext) => ({ tenantId: ctx.tenant.id, companyId: ctx.company.id });

export async function cashAccountOptions(ctx: CompanyContext): Promise<Option[]> {
  const rows = await db.account.findMany({ where: { ...scope(ctx), isCashLike: true, isActive: true }, orderBy: { code: "asc" } });
  return rows.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));
}

export async function accountOptions(ctx: CompanyContext): Promise<Option[]> {
  const rows = await db.account.findMany({ where: { ...scope(ctx), isActive: true }, orderBy: { code: "asc" } });
  return rows.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));
}

export async function customerOptions(ctx: CompanyContext): Promise<Option[]> {
  const rows = await db.customer.findMany({ where: scope(ctx), orderBy: { name: "asc" }, take: 1000 });
  return rows.map((c) => ({ value: c.id, label: c.phone ? `${c.name} · ${c.phone}` : c.name }));
}

export async function supplierOptions(ctx: CompanyContext): Promise<Option[]> {
  const rows = await db.supplier.findMany({ where: scope(ctx), orderBy: { name: "asc" }, take: 1000 });
  return rows.map((s) => ({ value: s.id, label: s.country ? `${s.name} · ${s.country}` : s.name }));
}

export async function activityOptions(ctx: CompanyContext, type?: "VEHICLES" | "LIVESTOCK" | "CLOTHING" | "GENERAL"): Promise<Option[]> {
  const rows = await db.businessActivity.findMany({ where: { ...scope(ctx), isActive: true, ...(type ? { type } : {}) }, orderBy: { createdAt: "asc" } });
  return rows.map((a) => ({ value: a.id, label: a.name }));
}

export async function warehouseOptions(ctx: CompanyContext): Promise<Option[]> {
  const rows = await db.warehouse.findMany({ where: scope(ctx), orderBy: { createdAt: "asc" } });
  return rows.map((w) => ({ value: w.id, label: w.name }));
}

export async function shipmentOptions(ctx: CompanyContext, type?: "VEHICLES" | "LIVESTOCK" | "CLOTHING" | "GENERAL"): Promise<Option[]> {
  const rows = await db.importShipment.findMany({ where: { ...scope(ctx), status: { not: "CLOSED" }, ...(type ? { type } : {}) }, orderBy: { createdAt: "desc" } });
  return rows.map((s) => ({ value: s.id, label: s.reference }));
}

export async function partnerOptions(ctx: CompanyContext): Promise<Option[]> {
  const rows = await db.partner.findMany({ where: { tenantId: ctx.tenant.id }, orderBy: { name: "asc" } });
  return rows.map((p) => ({ value: p.id, label: p.name }));
}

export const currencyOptions: Option[] = [
  { value: "SAR", label: "SAR · ريال سعودي" }, { value: "USD", label: "USD · دولار أمريكي" }, { value: "EUR", label: "EUR · يورو" },
  { value: "AED", label: "AED · درهم إماراتي" }, { value: "KRW", label: "KRW · وون كوري" }, { value: "CNY", label: "CNY · يوان صيني" },
  { value: "JPY", label: "JPY · ين ياباني" }, { value: "GBP", label: "GBP · جنيه إسترليني" }, { value: "TRY", label: "TRY · ليرة تركية" },
  { value: "AUD", label: "AUD · دولار أسترالي" }, { value: "SDG", label: "SDG · جنيه سوداني" },
];

export const toOptions = <T extends string>(labels: Record<T, string>): Option[] => Object.entries(labels).map(([value, label]) => ({ value, label: label as string }));
