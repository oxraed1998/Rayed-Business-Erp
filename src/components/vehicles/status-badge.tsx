import type { VehicleStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { VEHICLE_STATUS_LABELS } from "@/lib/domain/vehicle-cost";

const VARIANT: Record<VehicleStatus, "default" | "gold" | "success" | "warning" | "destructive" | "muted"> = {
  PURCHASED: "muted", IN_TRANSIT: "warning", CUSTOMS: "warning", IN_STOCK: "default", RESERVED: "gold", SOLD: "success", CANCELLED: "destructive",
};

export const VehicleStatusBadge = ({ status }: { status: VehicleStatus }) => <Badge variant={VARIANT[status]}>{VEHICLE_STATUS_LABELS[status]}</Badge>;
