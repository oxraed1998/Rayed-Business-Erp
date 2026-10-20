import type { InvoiceStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_STATUS_LABELS } from "@/lib/domain/invoice-calc";

const STATUS: Record<InvoiceStatus, [string, "muted" | "default" | "destructive"]> = { DRAFT: ["مسودة", "muted"], POSTED: ["مرحّلة", "default"], VOID: ["ملغاة", "destructive"] };
const PAY = { PAID: "success", PARTIAL: "warning", UNPAID: "muted", OVERDUE: "destructive" } as const;

export function InvoiceStatusBadges({ status, payment }: { status: InvoiceStatus; payment?: keyof typeof PAYMENT_STATUS_LABELS | null }) {
  const [label, variant] = STATUS[status];
  return (
    <span className="flex flex-wrap gap-1">
      <Badge variant={variant}>{label}</Badge>
      {payment && <Badge variant={PAY[payment]}>{PAYMENT_STATUS_LABELS[payment]}</Badge>}
    </span>
  );
}
