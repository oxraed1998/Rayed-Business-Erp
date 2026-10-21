import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/accounting", label: "دليل الحسابات" },
  { href: "/accounting/journal", label: "القيود اليومية" },
  { href: "/accounting/ledger", label: "دفتر الأستاذ" },
  { href: "/accounting/reports", label: "القوائم المالية" },
  { href: "/accounting/periods", label: "الفترات المالية" },
];

export function AccountingNav({ active }: { active: string }) {
  return (
    <div className="no-print mb-6 flex gap-1 overflow-x-auto rounded-xl border bg-card p-1 shadow-soft">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={cn("whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted", active === t.href && "bg-navy text-white hover:bg-navy dark:bg-gold dark:text-navy-deep")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
