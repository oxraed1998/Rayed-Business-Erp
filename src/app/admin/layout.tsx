import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { requireSuperAdmin } from "@/lib/context";
import { LogoutButton } from "@/components/auth/logout-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "إدارة المنصة" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSuperAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-sidebar px-4 text-white sm:px-6">
        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#e2c27d] to-[#b8893a] font-extrabold text-navy-deep">R</span>
        <div className="leading-tight">
          <p className="flex items-center gap-1.5 font-extrabold"><ShieldCheck className="size-4 text-gold" /> إدارة المنصة</p>
          <p className="text-[11px] text-sidebar-muted">{session.user.name} · Super Admin</p>
        </div>
        <div className="flex-1" />
        <Link href="/" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-sidebar-active"><ArrowRight className="size-4" /> العودة للتطبيق</Link>
        <div className="[&_button]:border-white/20 [&_button]:bg-transparent [&_button]:text-white"><LogoutButton /></div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
