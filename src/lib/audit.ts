import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";

export interface AuditInput {
  tenantId: string | null;
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: Prisma.InputJsonValue;
}

export async function audit(tx: Tx, a: AuditInput) {
  await tx.auditLog.create({
    data: {
      tenantId: a.tenantId,
      companyId: a.companyId ?? null,
      userId: a.userId ?? null,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId ?? null,
      data: a.data,
    },
  });
}
