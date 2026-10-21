import { Car, Beef, Shirt, BookOpen } from "lucide-react";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy-deep lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(220_60%_25%)_0,transparent_45%),radial-gradient(circle_at_80%_80%,hsl(40_60%_40%/.35)_0,transparent_40%)]" />
        <div className="absolute inset-0 opacity-[.07] [background-image:linear-gradient(hsl(0_0%_100%)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#e2c27d] to-[#b8893a] text-2xl font-extrabold text-navy-deep shadow-xl">R</span>
            <div>
              <p className="text-xl font-extrabold">رائد للأعمال</p>
              <p className="text-xs font-semibold tracking-[.2em] text-gold">RAYED BUSINESS ERP</p>
            </div>
          </div>
          <div className="max-w-lg">
            <h2 className="text-4xl font-extrabold leading-[1.35]">كل أعمالك في منصة واحدة<span className="text-gold">.</span></h2>
            <p className="mt-4 text-lg leading-relaxed text-white/70">إدارة متكاملة لاستيراد وبيع السيارات والمواشي والملابس، مع محاسبة مزدوجة القيد، وشراكات، وفواتير، وتقارير لحظية.</p>
            <div className="mt-10 grid grid-cols-2 gap-3">
              {[
                [Car, "تجارة السيارات", "تكلفة الاستيراد والربح لكل سيارة"],
                [Beef, "المواشي", "تكلفة الرأس والتقييم الفعلي"],
                [Shirt, "الملابس", "مقاسات وألوان ومستودعات"],
                [BookOpen, "المحاسبة", "قيود متوازنة وقوائم مالية"],
              ].map(([Icon, t, d]) => {
                const I = Icon as typeof Car;
                return (
                  <div key={t as string} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                    <I className="size-5 text-gold" />
                    <p className="mt-2 font-bold">{t as string}</p>
                    <p className="text-xs text-white/60">{d as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-white/40">© {new Date().getFullYear()} Rayed Business ERP</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-background p-6 sm:p-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-[#e2c27d] to-[#b8893a] text-xl font-extrabold text-navy-deep">R</span>
            <div><p className="font-extrabold">رائد للأعمال</p><p className="text-[11px] font-semibold tracking-widest text-gold">RAYED BUSINESS ERP</p></div>
          </div>
          <h1 className="text-[26px] font-extrabold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
