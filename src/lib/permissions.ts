import type { Role } from "@prisma/client";

const RESOURCES = {
  companies: ["read", "manage"],
  vehicles: ["read", "create", "update", "delete"],
  livestock: ["read", "create", "update", "delete"],
  clothing: ["read", "create", "update", "delete"],
  inventory: ["read", "manage"],
  accounting: ["read", "create", "approve", "close"],
  invoices: ["read", "create", "approve"],
  payments: ["read", "create"],
  customers: ["read", "manage"],
  suppliers: ["read", "manage"],
  contracts: ["read", "manage", "approve"],
  partners: ["read", "manage"],
  employees: ["read", "manage"],
  reports: ["read"],
  financials: ["read"],
  users: ["manage"],
  audit: ["read"],
  subscription: ["read"],
} as const;

type Resources = typeof RESOURCES;
export type Permission = { [K in keyof Resources]: `${K & string}.${Resources[K][number]}` }[keyof Resources];

export const ALL_PERMISSIONS: Permission[] = Object.entries(RESOURCES).flatMap(([r, actions]) =>
  (actions as readonly string[]).map((a) => `${r}.${a}` as Permission),
);

export const isPermission = (p: string): p is Permission => (ALL_PERMISSIONS as string[]).includes(p);

const reads = ALL_PERMISSIONS.filter((p) => p.endsWith(".read"));
const operational: Permission[] = [
  "vehicles.read", "vehicles.create", "vehicles.update",
  "livestock.read", "livestock.create", "livestock.update",
  "clothing.read", "clothing.create", "clothing.update",
  "inventory.read", "inventory.manage",
  "customers.read", "customers.manage",
  "suppliers.read", "suppliers.manage",
  "contracts.read",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  TENANT_OWNER: ALL_PERMISSIONS,
  COMPANY_ADMIN: ALL_PERMISSIONS.filter((p) => p !== "subscription.read"),
  ACCOUNTANT: [
    ...reads.filter((p) => p !== "audit.read" && p !== "subscription.read"),
    "accounting.create", "accounting.approve", "accounting.close",
    "invoices.create", "invoices.approve", "payments.create",
    "customers.manage", "suppliers.manage", "partners.manage",
  ],
  MANAGER: [
    ...operational,
    "vehicles.delete", "livestock.delete", "clothing.delete",
    "invoices.read", "invoices.create", "payments.read", "payments.create",
    "contracts.manage", "employees.read", "reports.read", "financials.read", "partners.read",
  ],
  EMPLOYEE: operational,
  VIEWER: ["vehicles.read", "livestock.read", "clothing.read", "inventory.read", "customers.read", "suppliers.read", "contracts.read"],
};

export const ROLE_LABELS: Record<Role, string> = {
  TENANT_OWNER: "مالك المنشأة",
  COMPANY_ADMIN: "مدير الشركة",
  ACCOUNTANT: "محاسب",
  MANAGER: "مدير",
  EMPLOYEE: "موظف",
  VIEWER: "مشاهد",
};

export interface PermissionSubject {
  role: Role;
  grants: string[];
  denials: string[];
}

export function effectivePermissions(m: PermissionSubject): Set<Permission> {
  const set = new Set<Permission>(ROLE_PERMISSIONS[m.role]);
  for (const g of m.grants) if (isPermission(g)) set.add(g);
  // Owners can never be locked out of their own tenant.
  if (m.role !== "TENANT_OWNER") for (const d of m.denials) if (isPermission(d)) set.delete(d);
  return set;
}

export function can(m: PermissionSubject, p: Permission): boolean {
  return effectivePermissions(m).has(p);
}

/** Roles a member may assign: never above their own rank. */
const RANK: Record<Role, number> = { TENANT_OWNER: 6, COMPANY_ADMIN: 5, ACCOUNTANT: 4, MANAGER: 4, EMPLOYEE: 2, VIEWER: 1 };
export const canAssignRole = (actor: Role, target: Role) => actor === "TENANT_OWNER" || RANK[target] < RANK[actor];
