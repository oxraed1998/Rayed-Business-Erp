import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "الشركة الحالية" },
  { href: "/settings/companies", label: "الشركات" },
  { href: "/settings/users", label: "المستخدمون والصلاحيات" },
  { href: "/settings/subscription", label: "الاشتراك" },
  { href: "/settings/audit", label: "سجل التدقيق" },
];

export function SettingsNav({ active }: { active: string }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border bg-card p-1 shadow-soft">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={cn("whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted", active === t.href && "bg-navy text-white hover:bg-navy dark:bg-gold dark:text-navy-deep")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
