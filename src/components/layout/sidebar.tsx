"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./nav";
import { ICONS } from "./icons";

export function SidebarContent({ groups, superAdmin, onNavigate }: { groups: NavGroup[]; superAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-sidebar-muted/80">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-sidebar-foreground/80 transition-colors hover:bg-sidebar-active hover:text-white",
                      active && "bg-sidebar-active text-white shadow-[inset_-3px_0_0_hsl(var(--gold))]",
                    )}
                  >
                    {Icon && <Icon className={cn("size-[18px] text-sidebar-muted transition-colors group-hover:text-gold", active && "text-gold")} />}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {superAdmin && (
        <div>
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-sidebar-muted/80">المنصة</p>
          <Link href="/admin" onClick={onNavigate} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-gold hover:bg-sidebar-active", pathname.startsWith("/admin") && "bg-sidebar-active")}>
            <ShieldCheck className="size-[18px]" /> إدارة المنصة
          </Link>
        </div>
      )}
    </nav>
  );
}

export function Brand({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-5">
      <Link href="/" className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#e2c27d] to-[#b8893a] text-lg font-extrabold text-navy-deep shadow-lg">R</span>
        <span className="leading-tight">
          <span className="block text-[17px] font-extrabold text-white">رائد للأعمال</span>
          <span className="block text-[11px] font-semibold tracking-wide text-gold">RAYED BUSINESS ERP</span>
        </span>
      </Link>
      {onClose && (
        <button onClick={onClose} className="rounded-md p-1 text-sidebar-muted hover:text-white lg:hidden" aria-label="إغلاق القائمة">
          <X className="size-5" />
        </button>
      )}
    </div>
  );
}
