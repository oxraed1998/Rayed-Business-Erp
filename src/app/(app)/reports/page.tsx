import Link from "next/link";
import { BarChart3, BookOpen, Download, FileSpreadsheet, Printer, Scale, TrendingUp, Users, Truck, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { pageCompanyContext } from "@/lib/context";
import type { Permission } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = { title: "التقارير" };

const VIEWS: { href: string; title: string; desc: string; icon: LucideIcon; permission: Permission }[] = [
  { href: "/accounting/reports?report=trial", title: "ميزان المراجعة", desc: "أرصدة جميع الحسابات والتحقق من التوازن", icon: Scale, permission: "accounting.read" },
  { href: "/accounting/reports?report=income", title: "قائمة الدخل", desc: "الإيرادات وتكلفة المبيعات والمصروفات وصافي الربح", icon: TrendingUp, permission: "accounting.read" },
  { href: "/accounting/reports?report=balance", title: "الميزانية العمومية", desc: "الأصول والخصوم وحقوق الملكية", icon: BookOpen, permission: "accounting.read" },
  { href: "/customers", title: "كشوف حساب العملاء", desc: "افتح العميل لعرض كشف حسابه من دفتر الأستاذ", icon: Users, permission: "customers.read" },
  { href: "/suppliers", title: "كشوف حساب الموردين", desc: "افتح المورد لعرض كشف حسابه", icon: Truck, permission: "suppliers.read" },
  { href: "/inventory", title: "تقرير المخزون", desc: "الكميات حسب المستودع والأصناف منخفضة المخزون", icon: Package, permission: "inventory.read" },
  { href: "/partners", title: "كشوف الشركاء", desc: "المساهمات والتوزيعات والأرصدة لكل اتفاقية", icon: BarChart3, permission: "partners.read" },
];

const EXPORTS: { report: string; title: string; permission: Permission; dated?: boolean }[] = [
  { report: "trial-balance", title: "ميزان المراجعة", permission: "accounting.read", dated: true },
  { report: "income-statement", title: "قائمة الدخل", permission: "accounting.read", dated: true },
  { report: "sales", title: "تقرير المبيعات", permission: "invoices.read", dated: true },
  { report: "purchases", title: "تقرير المشتريات", permission: "invoices.read", dated: true },
  { report: "vehicles", title: "ربحية السيارات", permission: "financials.read", dated: true },
  { report: "livestock", title: "تكلفة المواشي", permission: "livestock.read" },
  { report: "inventory", title: "المخزون (الملابس)", permission: "inventory.read" },
  { report: "customers-balances", title: "أرصدة العملاء", permission: "customers.read" },
  { report: "suppliers-balances", title: "أرصدة الموردين", permission: "suppliers.read" },
  { report: "partners", title: "أرصدة الشركاء", permission: "partners.read", dated: true },
  { report: "employees", title: "الموظفون", permission: "employees.read" },
];

export default async function ReportsPage() {
  const ctx = await pageCompanyContext("reports.read");
  const views = VIEWS.filter((v) => ctx.permissions.has(v.permission));
  const exports = EXPORTS.filter((e) => ctx.permissions.has(e.permission));
  const year = new Date().getUTCFullYear();
  return (
    <div className="space-y-6">
      <PageHeader title="التقارير" description={`${ctx.company.name} · جميع التقارير مبنية على البيانات الفعلية للشركة الحالية فقط`} icon={BarChart3} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {views.map((v) => (
          <Link key={v.href} href={v.href} className="group rounded-xl border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift">
            <span className="grid size-10 place-items-center rounded-lg bg-gold-soft text-accent-foreground"><v.icon className="size-5" /></span>
            <p className="mt-3 font-bold group-hover:text-gold">{v.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{v.desc}</p>
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-gold" /> التصدير إلى Excel</CardTitle>
          <CardDescription>ملفات CSV بترميز UTF-8 تفتح مباشرة في Excel وتدعم العربية. حدّد الفترة للتقارير المؤرخة.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {exports.map((e) => (
            <form key={e.report} action={`/api/export/${e.report}`} method="get" className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <span className="min-w-[160px] flex-1 text-sm font-semibold">{e.title}</span>
              {e.dated && <>
                <Input type="date" name="from" defaultValue={`${year}-01-01`} className="h-9 w-40" aria-label="من" />
                <Input type="date" name="to" defaultValue={new Date().toISOString().slice(0, 10)} className="h-9 w-40" aria-label="إلى" />
              </>}
              <Button size="sm" variant="outline" className="h-9"><Download /> تنزيل CSV</Button>
            </form>
          ))}
        </CardContent>
      </Card>
      <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/40 p-4 text-sm">
        <Printer className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">تصدير PDF: افتح التقرير أو الفاتورة واستخدم طباعة المتصفح (حفظ كـ PDF) — الصفحات مهيأة للطباعة. تصدير ملفات .xlsx الأصلية غير متاح حاليًا؛ ملفات CSV أعلاه تُفتح في Excel.</p>
      </div>
    </div>
  );
}
