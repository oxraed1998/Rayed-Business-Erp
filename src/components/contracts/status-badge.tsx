import type { ContractStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { CONTRACT_STATUS_LABELS } from "@/server/services/contracts";

const V: Record<ContractStatus, "muted" | "warning" | "success" | "destructive" | "default"> = { DRAFT: "muted", PENDING_APPROVAL: "warning", ACTIVE: "success", EXPIRED: "destructive", TERMINATED: "destructive" };

export const ContractStatusBadge = ({ status }: { status: ContractStatus }) => <Badge variant={V[status]}>{CONTRACT_STATUS_LABELS[status]}</Badge>;
