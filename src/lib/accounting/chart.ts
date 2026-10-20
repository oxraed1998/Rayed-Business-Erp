import type { AccountType } from "@prisma/client";
import type { Tx } from "@/lib/db";

export type SystemKey =
  | "CASH" | "BANK" | "AR" | "VAT_INPUT" | "PREPAID"
  | "INV_VEHICLES" | "INV_LIVESTOCK" | "INV_CLOTHING" | "INV_GENERAL" | "GOODS_IN_TRANSIT"
  | "AP" | "VAT_OUTPUT" | "CUSTOMER_ADVANCES" | "PARTNER_PAYABLE"
  | "CAPITAL" | "PARTNER_CURRENT" | "RETAINED_EARNINGS"
  | "SALES_VEHICLES" | "SALES_LIVESTOCK" | "SALES_CLOTHING" | "SALES_GENERAL" | "OTHER_INCOME"
  | "COGS_VEHICLES" | "COGS_LIVESTOCK" | "COGS_CLOTHING" | "COGS_GENERAL"
  | "LIVESTOCK_MORTALITY" | "INVENTORY_ADJUSTMENT" | "SALARIES" | "RENT" | "GENERAL_EXPENSES" | "FX_DIFF"
  | "NON_RECOVERABLE_VAT";

interface DefaultAccount {
  code: string;
  name: string;
  type: AccountType;
  key?: SystemKey;
  cash?: boolean;
}

/** Default chart of accounts for a Saudi trading company (codes follow a 1-5 class scheme). */
export const DEFAULT_CHART: DefaultAccount[] = [
  { code: "1101", name: "الصندوق", type: "ASSET", key: "CASH", cash: true },
  { code: "1102", name: "البنك", type: "ASSET", key: "BANK", cash: true },
  { code: "1201", name: "ذمم العملاء", type: "ASSET", key: "AR" },
  { code: "1301", name: "مخزون السيارات", type: "ASSET", key: "INV_VEHICLES" },
  { code: "1302", name: "مخزون المواشي", type: "ASSET", key: "INV_LIVESTOCK" },
  { code: "1303", name: "مخزون الملابس", type: "ASSET", key: "INV_CLOTHING" },
  { code: "1304", name: "مخزون عام", type: "ASSET", key: "INV_GENERAL" },
  { code: "1305", name: "بضاعة في الطريق", type: "ASSET", key: "GOODS_IN_TRANSIT" },
  { code: "1401", name: "ضريبة القيمة المضافة - مدخلات", type: "ASSET", key: "VAT_INPUT" },
  { code: "1501", name: "مصروفات مدفوعة مقدمًا", type: "ASSET", key: "PREPAID" },
  { code: "2101", name: "ذمم الموردين", type: "LIABILITY", key: "AP" },
  { code: "2201", name: "ضريبة القيمة المضافة - مخرجات", type: "LIABILITY", key: "VAT_OUTPUT" },
  { code: "2301", name: "دفعات مقدمة من العملاء", type: "LIABILITY", key: "CUSTOMER_ADVANCES" },
  { code: "2401", name: "مستحقات الشركاء", type: "LIABILITY", key: "PARTNER_PAYABLE" },
  { code: "3101", name: "رأس المال", type: "EQUITY", key: "CAPITAL" },
  { code: "3201", name: "جاري الشركاء", type: "EQUITY", key: "PARTNER_CURRENT" },
  { code: "3301", name: "الأرباح المبقاة", type: "EQUITY", key: "RETAINED_EARNINGS" },
  { code: "4101", name: "مبيعات السيارات", type: "REVENUE", key: "SALES_VEHICLES" },
  { code: "4102", name: "مبيعات المواشي", type: "REVENUE", key: "SALES_LIVESTOCK" },
  { code: "4103", name: "مبيعات الملابس", type: "REVENUE", key: "SALES_CLOTHING" },
  { code: "4104", name: "مبيعات عامة", type: "REVENUE", key: "SALES_GENERAL" },
  { code: "4901", name: "إيرادات أخرى", type: "REVENUE", key: "OTHER_INCOME" },
  { code: "5101", name: "تكلفة السيارات المباعة", type: "EXPENSE", key: "COGS_VEHICLES" },
  { code: "5102", name: "تكلفة المواشي المباعة", type: "EXPENSE", key: "COGS_LIVESTOCK" },
  { code: "5103", name: "تكلفة الملابس المباعة", type: "EXPENSE", key: "COGS_CLOTHING" },
  { code: "5104", name: "تكلفة المبيعات العامة", type: "EXPENSE", key: "COGS_GENERAL" },
  { code: "5201", name: "نفوق المواشي", type: "EXPENSE", key: "LIVESTOCK_MORTALITY" },
  { code: "5202", name: "تسويات المخزون", type: "EXPENSE", key: "INVENTORY_ADJUSTMENT" },
  { code: "5301", name: "الرواتب والأجور", type: "EXPENSE", key: "SALARIES" },
  { code: "5302", name: "الإيجارات", type: "EXPENSE", key: "RENT" },
  { code: "5303", name: "مصروفات عمومية وإدارية", type: "EXPENSE", key: "GENERAL_EXPENSES" },
  { code: "5304", name: "فروقات أسعار الصرف", type: "EXPENSE", key: "FX_DIFF" },
  { code: "5305", name: "ضريبة قيمة مضافة غير قابلة للاسترداد", type: "EXPENSE", key: "NON_RECOVERABLE_VAT" },
];

export async function seedChartOfAccounts(tx: Tx, tenantId: string, companyId: string) {
  await tx.account.createMany({
    data: DEFAULT_CHART.map((a) => ({
      tenantId,
      companyId,
      code: a.code,
      name: a.name,
      type: a.type,
      systemKey: a.key ?? null,
      isCashLike: Boolean(a.cash),
    })),
    skipDuplicates: true,
  });
}

export async function systemAccounts(tx: Tx, companyId: string, keys: SystemKey[]) {
  const rows = await tx.account.findMany({ where: { companyId, systemKey: { in: keys } } });
  const map = new Map(rows.map((r) => [r.systemKey as SystemKey, r.id]));
  for (const k of keys) if (!map.has(k)) throw new Error(`Missing system account ${k}`);
  return (k: SystemKey) => map.get(k)!;
}

/** Normal balance side: assets & expenses are debit-normal. */
export const isDebitNormal = (t: AccountType) => t === "ASSET" || t === "EXPENSE";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "أصول",
  LIABILITY: "خصوم",
  EQUITY: "حقوق ملكية",
  REVENUE: "إيرادات",
  EXPENSE: "مصروفات",
};

export const ACTIVITY_ACCOUNTS = {
  VEHICLES: { inventory: "INV_VEHICLES", sales: "SALES_VEHICLES", cogs: "COGS_VEHICLES" },
  LIVESTOCK: { inventory: "INV_LIVESTOCK", sales: "SALES_LIVESTOCK", cogs: "COGS_LIVESTOCK" },
  CLOTHING: { inventory: "INV_CLOTHING", sales: "SALES_CLOTHING", cogs: "COGS_CLOTHING" },
  GENERAL: { inventory: "INV_GENERAL", sales: "SALES_GENERAL", cogs: "COGS_GENERAL" },
} as const satisfies Record<string, { inventory: SystemKey; sales: SystemKey; cogs: SystemKey }>;
