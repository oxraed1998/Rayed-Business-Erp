import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";

export const RESOURCE_LABELS: Record<string, string> = {
  companies: "الشركات", vehicles: "السيارات", livestock: "المواشي", clothing: "الملابس", inventory: "المخزون", accounting: "المحاسبة",
  invoices: "الفواتير", payments: "المدفوعات", customers: "العملاء", suppliers: "الموردون", contracts: "العقود", partners: "الشركاء",
  employees: "الموظفون", reports: "التقارير", financials: "البيانات المالية", users: "المستخدمون", audit: "سجل التدقيق", subscription: "الاشتراك",
};

export const ACTION_LABELS: Record<string, string> = {
  read: "عرض", create: "إضافة", update: "تعديل", delete: "حذف", manage: "إدارة", approve: "اعتماد", close: "إقفال الفترات",
};

export const permissionGroups = () => {
  const groups = new Map<string, Permission[]>();
  for (const p of ALL_PERMISSIONS) {
    const [r] = p.split(".");
    groups.set(r, [...(groups.get(r) ?? []), p]);
  }
  return [...groups.entries()].map(([resource, perms]) => ({ resource, label: RESOURCE_LABELS[resource] ?? resource, perms: perms.map((p) => ({ value: p, label: ACTION_LABELS[p.split(".")[1]] ?? p })) }));
};
