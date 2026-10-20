import type { EmploymentStatus } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { toDb, type DecimalLike } from "@/lib/money";
import { NotFound, ServiceError, type Actor } from "./actor";

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = { ACTIVE: "على رأس العمل", ON_LEAVE: "في إجازة", TERMINATED: "منتهية خدمته" };

export interface EmployeeInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  nationalId?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  hireDate?: Date | null;
  salary?: DecimalLike | null;
  salaryCurrency: string;
  membershipId?: string | null;
}

async function assertMembership(tx: Tx, actor: Actor, membershipId: string | null | undefined, employeeId?: string) {
  if (!membershipId) return null;
  const m = await tx.membership.findFirst({ where: { id: membershipId, tenantId: actor.tenantId }, include: { employee: true } });
  if (!m) throw NotFound("حساب المستخدم");
  if (m.employee && m.employee.id !== employeeId) throw new ServiceError("حساب المستخدم مرتبط بموظف آخر");
  return m;
}

export async function createEmployee(tx: Tx, actor: Actor, input: EmployeeInput) {
  await assertMembership(tx, actor, input.membershipId);
  const e = await tx.employee.create({
    data: {
      tenantId: actor.tenantId, companyId: actor.companyId, name: input.name, phone: input.phone ?? null, email: input.email ?? null,
      nationalId: input.nationalId ?? null, department: input.department ?? null, jobTitle: input.jobTitle ?? null, hireDate: input.hireDate ?? null,
      salary: input.salary != null && input.salary !== "" ? toDb(input.salary) : null, salaryCurrency: input.salaryCurrency, membershipId: input.membershipId ?? null,
    },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "Employee", entityId: e.id, data: { name: e.name } });
  return e;
}

export async function updateEmployee(tx: Tx, actor: Actor, id: string, input: EmployeeInput & { status: EmploymentStatus }) {
  const e = await tx.employee.findFirst({ where: { id, tenantId: actor.tenantId, companyId: actor.companyId } });
  if (!e) throw NotFound("الموظف");
  await assertMembership(tx, actor, input.membershipId, e.id);
  await tx.employee.update({
    where: { id: e.id },
    data: {
      name: input.name, phone: input.phone ?? null, email: input.email ?? null, nationalId: input.nationalId ?? null, department: input.department ?? null,
      jobTitle: input.jobTitle ?? null, hireDate: input.hireDate ?? null, salary: input.salary != null && input.salary !== "" ? toDb(input.salary) : null,
      salaryCurrency: input.salaryCurrency, membershipId: input.membershipId ?? null, status: input.status,
    },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "update", entity: "Employee", entityId: e.id, data: { status: input.status } });
}
