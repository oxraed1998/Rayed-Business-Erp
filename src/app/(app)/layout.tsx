import { redirect } from "next/navigation";
import { Brand, SidebarContent } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { NAV } from "@/components/layout/nav";
import { getSession } from "@/lib/auth/session";
import { getTenantContext } from "@/lib/context";
import { ROLE_LABELS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const ctx = await getTenantContext();
  if (!ctx) redirect(session.user.isSuperAdmin ? "/admin" : "/no-access");

  // Only show navigation the member is allowed to use (the server re-checks on every request).
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || ctx.permissions.has(i.permission)) })).filter((g) => g.items.length);

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 right-0 z-20 hidden w-64 flex-col bg-sidebar lg:flex">
        <Brand />
        <SidebarContent groups={groups} superAdmin={ctx.user.isSuperAdmin} />
        <div className="border-t border-white/5 px-5 py-3 text-[11px] text-sidebar-muted">
          {ctx.tenant.name}
        </div>
      </aside>
      <div className="lg:pr-64">
        <Topbar
          user={{ name: ctx.user.name, email: ctx.user.email }}
          tenantName={ctx.tenant.name}
          companies={ctx.companies.map((c) => ({ id: c.id, name: c.name }))}
          companyId={ctx.company?.id ?? null}
          groups={groups}
          superAdmin={ctx.user.isSuperAdmin}
          roleLabel={ROLE_LABELS[ctx.role]}
        />
        <main className="mx-auto max-w-[1400px] px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
