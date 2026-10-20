import type { LucideIcon } from "lucide-react";
import { Inbox, Lock } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton h-4", className)} />;

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-gold-soft text-accent-foreground">
        <Icon className="size-7" />
      </div>
      <div>
        <p className="font-bold">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, icon: Icon }: { title: string; description?: string; actions?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="hidden size-11 place-items-center rounded-xl bg-navy text-gold shadow-sm sm:grid dark:bg-gold/15">
            <Icon className="size-5" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "default" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: "default" | "gold" | "success" | "danger" }) {
  const tones = {
    default: "bg-primary/8 text-primary dark:bg-gold/10 dark:text-gold",
    gold: "bg-gold-soft text-accent-foreground",
    success: "bg-success/10 text-success",
    danger: "bg-destructive/10 text-destructive",
  };
  return (
    <div className="group rounded-xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        {Icon && <span className={cn("grid size-9 place-items-center rounded-lg", tones[tone])}><Icon className="size-4" /></span>}
      </div>
      <p className="num mt-2 text-right text-lg font-extrabold tracking-tight sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Honest marker for functionality that is not built yet. */
export function Unavailable({ feature, children }: { feature: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/40 p-4 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="font-semibold">{feature} — غير متاح حاليًا</p>
        {children && <p className="mt-1 text-muted-foreground">{children}</p>}
      </div>
    </div>
  );
}

export function KeyValue({ items, className }: { items: [string, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 truncate font-semibold">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
