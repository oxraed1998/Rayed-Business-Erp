import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap", {
  variants: {
    variant: {
      default: "bg-primary/10 text-primary dark:bg-gold/15 dark:text-gold",
      gold: "bg-gold-soft text-accent-foreground",
      success: "bg-success/12 text-success",
      warning: "bg-warning/15 text-warning",
      destructive: "bg-destructive/10 text-destructive",
      muted: "bg-muted text-muted-foreground",
      outline: "border text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ variant }), className)} {...p} />;
}
