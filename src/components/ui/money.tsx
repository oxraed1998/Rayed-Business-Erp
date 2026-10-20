import { formatMoney, type DecimalLike, D } from "@/lib/money";
import { cn } from "@/lib/utils";

export function Money({ value, currency = "SAR", className, signed }: { value: DecimalLike | null | undefined; currency?: string; className?: string; signed?: boolean }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  const d = D(value);
  return <span className={cn("num whitespace-nowrap", signed && d.isNegative() && "text-destructive", signed && d.gt(0) && "text-success", className)}>{formatMoney(d, currency)}</span>;
}
