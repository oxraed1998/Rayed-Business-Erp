"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Building2, Check, ChevronDown, LogOut, Menu, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Brand, SidebarContent } from "./sidebar";
import type { NavGroup } from "./nav";
import { logoutAction, switchCompanyAction } from "@/server/actions/session";
import { cn } from "@/lib/utils";

const menuItem = "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-muted";
const menuContent = "z-50 min-w-[220px] rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lift";

export function Topbar({ user, tenantName, companies, companyId, groups, superAdmin, roleLabel }: {
  user: { name: string; email: string }; tenantName: string; companies: { id: string; name: string }[]; companyId: string | null;
  groups: NavGroup[]; superAdmin: boolean; roleLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => setMounted(true), []);
  const current = companies.find((c) => c.id === companyId);

  const switchCompany = (id: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("companyId", id);
      const r = await switchCompanyAction(null, fd);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
        <button className="rounded-lg p-2 hover:bg-muted lg:hidden" onClick={() => setOpen(true)} aria-label="فتح القائمة">
          <Menu className="size-5" />
        </button>

        <DropdownMenu.Root dir="rtl">
          <DropdownMenu.Trigger className="flex min-w-0 items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm font-semibold shadow-sm hover:bg-muted disabled:opacity-60" disabled={pending}>
            <Building2 className="size-4 shrink-0 text-gold" />
            <span className="truncate">{current?.name ?? "لا توجد شركة"}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={menuContent} align="start" sideOffset={6}>
              <DropdownMenu.Label className="px-2.5 py-1.5 text-xs text-muted-foreground">{tenantName}</DropdownMenu.Label>
              {companies.map((c) => (
                <DropdownMenu.Item key={c.id} className={menuItem} onSelect={() => c.id !== companyId && switchCompany(c.id)}>
                  <Check className={cn("size-4", c.id === companyId ? "opacity-100 text-gold" : "opacity-0")} />
                  {c.name}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild className={menuItem}><Link href="/settings/companies">إدارة الشركات</Link></DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <div className="flex-1" />

        <button className="rounded-lg p-2 hover:bg-muted" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="تبديل الوضع الليلي">
          {mounted && resolvedTheme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>

        <DropdownMenu.Root dir="rtl">
          <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted">
            <span className="grid size-9 place-items-center rounded-full bg-navy text-sm font-bold text-gold dark:bg-gold/15">{user.name.slice(0, 1)}</span>
            <span className="hidden text-start leading-tight sm:block">
              <span className="block text-sm font-bold">{user.name}</span>
              <span className="block text-[11px] text-muted-foreground">{roleLabel}</span>
            </span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={menuContent} align="end" sideOffset={6}>
              <DropdownMenu.Label className="px-2.5 py-1.5"><span className="block text-sm font-bold">{user.name}</span><span className="block text-xs text-muted-foreground" dir="ltr">{user.email}</span></DropdownMenu.Label>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild className={menuItem}><Link href="/profile"><UserRound className="size-4" /> الملف الشخصي</Link></DropdownMenu.Item>
              <DropdownMenu.Item className={cn(menuItem, "text-destructive")} onSelect={() => start(async () => { await logoutAction(); router.push("/login"); })}>
                <LogOut className="size-4" /> تسجيل الخروج
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>

      {/* Mobile drawer */}
      <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")}>
        <div className={cn("absolute inset-0 bg-navy-deep/60 backdrop-blur-sm transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside className={cn("absolute inset-y-0 right-0 flex w-72 flex-col bg-sidebar shadow-2xl transition-transform", open ? "translate-x-0" : "translate-x-full")}>
          <Brand onClose={() => setOpen(false)} />
          <SidebarContent groups={groups} superAdmin={superAdmin} onNavigate={() => setOpen(false)} />
        </aside>
      </div>
    </>
  );
}
