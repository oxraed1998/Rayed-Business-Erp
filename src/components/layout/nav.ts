import type { Permission } from "@/lib/permissions";

export interface NavItem { href: string; label: string; icon: string; permission?: Permission }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "عام", items: [{ href: "/", label: "لوحة التحكم", icon: "LayoutDashboard" }] },
  {
    label: "الأنشطة التجارية",
    items: [
      { href: "/vehicles", label: "السيارات", icon: "Car", permission: "vehicles.read" },
      { href: "/vehicles/market", label: "سوق Encar الكوري", icon: "Globe2", permission: "vehicles.read" },
      { href: "/livestock", label: "المواشي", icon: "Beef", permission: "livestock.read" },
      { href: "/clothing", label: "الملابس", icon: "Shirt", permission: "clothing.read" },
      { href: "/shipments", label: "شحنات الاستيراد", icon: "Ship", permission: "inventory.read" },
      { href: "/inventory", label: "المخزون والمستودعات", icon: "Warehouse", permission: "inventory.read" },
    ],
  },
  {
    label: "المبيعات والمشتريات",
    items: [
      { href: "/invoices", label: "الفواتير", icon: "FileText", permission: "invoices.read" },
      { href: "/payments", label: "سندات القبض والصرف", icon: "Banknote", permission: "payments.read" },
      { href: "/installments", label: "الأقساط", icon: "CalendarClock", permission: "invoices.read" },
      { href: "/customers", label: "العملاء", icon: "Users", permission: "customers.read" },
      { href: "/suppliers", label: "الموردون", icon: "Truck", permission: "suppliers.read" },
      { href: "/contracts", label: "العقود", icon: "FileSignature", permission: "contracts.read" },
    ],
  },
  {
    label: "المالية",
    items: [
      { href: "/accounting", label: "المحاسبة", icon: "BookOpen", permission: "accounting.read" },
      { href: "/partners", label: "الشركاء والمستثمرون", icon: "Handshake", permission: "partners.read" },
      { href: "/reports", label: "التقارير", icon: "BarChart3", permission: "reports.read" },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { href: "/employees", label: "الموظفون", icon: "IdCard", permission: "employees.read" },
      { href: "/settings", label: "الإعدادات", icon: "Settings", permission: "companies.read" },
    ],
  },
];
