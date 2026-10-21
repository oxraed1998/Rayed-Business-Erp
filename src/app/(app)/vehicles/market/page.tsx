import Link from "next/link";
import { AlertTriangle, Globe2, Search } from "lucide-react";
import { pageCompanyContext } from "@/lib/context";
import { encarConfigured, encarQuota, EncarError, searchCars } from "@/lib/encar/client";
import { ENCAR_FUELS, ENCAR_MANUFACTURERS } from "@/lib/encar/normalize";
import { importedListings, latestKrwRate } from "@/server/queries/encar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { EncarCarCard } from "@/components/encar/car-card";

export const metadata = { title: "سوق السيارات الكورية" };
const PAGE_SIZE = 24;

const int = (v: string | undefined, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

export default async function EncarMarketPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageCompanyContext("vehicles.read");
  const sp = await searchParams;
  const page = int(sp.page, 1, 10_000) ?? 1;
  const manufacturer = ENCAR_MANUFACTURERS.includes(sp.manufacturer as never) ? sp.manufacturer : undefined;
  const fuel = sp.fuel && sp.fuel in ENCAR_FUELS ? sp.fuel : undefined;
  const model = sp.model?.trim().slice(0, 60) || undefined;
  const yearFrom = int(sp.yearFrom, 1990, 2100);
  const yearTo = int(sp.yearTo, 1990, 2100);
  const priceFrom = int(sp.priceFrom, 1, 100_000);
  const priceTo = int(sp.priceTo, 1, 100_000);
  const sort = sp.sort === "priceAsc" || sp.sort === "priceDesc" ? sp.sort : undefined;

  let result: Awaited<ReturnType<typeof searchCars>> | null = null;
  let error: string | null = null;
  try {
    result = await searchCars({
      manufacturer, model, fuel, yearFrom, yearTo, sort, page: page - 1, count: PAGE_SIZE,
      priceFromKrw: priceFrom ? priceFrom * 1_000_000 : undefined,
      priceToKrw: priceTo ? priceTo * 1_000_000 : undefined,
    });
  } catch (e) {
    error = e instanceof EncarError ? e.message : "تعذر تحميل الإعلانات من Encar";
    if (!(e instanceof EncarError)) console.error("[encar] search failed", e);
  }
  const [rate, imported] = await Promise.all([latestKrwRate(ctx), importedListings(ctx, result?.cars.map((c) => c.id) ?? [])]);
  const quota = encarQuota();
  const pages = result ? Math.ceil(result.total / PAGE_SIZE) : 0;
  const href = (p: number) => "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, page: String(p) }).toString();

  return (
    <div>
      <PageHeader title="سوق السيارات الكورية" description="إعلانات Encar.com الحية عبر خدمة autokoreablendi — ابحث واستورد مباشرة إلى المخزون" icon={Globe2}
        actions={<Button asChild variant="outline"><Link href="/vehicles">مخزون السيارات</Link></Button>} />

      {!encarConfigured() && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>لم يُضبط مفتاح الخدمة <code dir="ltr">ENCAR_API_KEY</code> على الخادم؛ قد تكون النتائج محدودة أو تتوقف.</p>
        </div>
      )}

      <Card>
        <form method="get" className="grid gap-2 border-b p-3 sm:grid-cols-3 lg:grid-cols-8">
          <NativeSelect name="manufacturer" defaultValue={manufacturer ?? ""} aria-label="الشركة المصنعة" className="h-9 lg:col-span-2">
            <option value="">كل الشركات</option>
            {ENCAR_MANUFACTURERS.map((m) => <option key={m} value={m}>{m}</option>)}
          </NativeSelect>
          <Input name="model" defaultValue={model} placeholder="الطراز (مثل K5, Sonata)" dir="ltr" className="h-9 text-right lg:col-span-2" />
          <NativeSelect name="fuel" defaultValue={fuel ?? ""} aria-label="الوقود" className="h-9">
            <option value="">كل أنواع الوقود</option>
            {Object.entries(ENCAR_FUELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
          <NativeSelect name="sort" defaultValue={sort ?? ""} aria-label="الترتيب" className="h-9">
            <option value="">الأحدث</option>
            <option value="priceAsc">السعر: الأقل أولًا</option>
            <option value="priceDesc">السعر: الأعلى أولًا</option>
          </NativeSelect>
          <Input name="yearFrom" type="number" min={1990} max={2100} defaultValue={yearFrom} placeholder="من سنة" className="h-9" />
          <Input name="yearTo" type="number" min={1990} max={2100} defaultValue={yearTo} placeholder="إلى سنة" className="h-9" />
          <Input name="priceFrom" type="number" min={1} defaultValue={priceFrom} placeholder="السعر من (مليون ₩)" className="h-9 lg:col-span-2" />
          <Input name="priceTo" type="number" min={1} defaultValue={priceTo} placeholder="إلى (مليون ₩)" className="h-9 lg:col-span-2" />
          <Button size="sm" className="h-9 lg:col-span-2"><Search /> بحث</Button>
          <Button asChild size="sm" variant="ghost" className="h-9 lg:col-span-2"><Link href="/vehicles/market">مسح التصفية</Link></Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
          <span>{result ? `${new Intl.NumberFormat("en-US").format(result.total)} إعلان` : "—"}</span>
          <span>
            {rate ? `سعر الوون المعتمد: ${rate} ${ctx.company.baseCurrency}` : "لا يوجد سعر صرف محفوظ للوون؛ يُحدد عند أول استيراد"}
            {quota && ` · المتبقي من الحصة اليومية: ${quota.remaining} من ${quota.limit}`}
          </span>
        </div>

        {error ? (
          <EmptyState icon={AlertTriangle} title="تعذر تحميل الإعلانات" description={error} action={<Button asChild variant="outline"><a href={href(page)}>إعادة المحاولة</a></Button>} />
        ) : result && result.cars.length ? (
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result.cars.map((c) => <EncarCarCard key={c.id} car={c} rate={rate} baseCurrency={ctx.company.baseCurrency} imported={imported.has(c.id)} />)}
          </div>
        ) : (
          <EmptyState icon={Search} title="لا توجد نتائج" description="جرّب تخفيف شروط البحث." />
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between p-3 text-xs text-muted-foreground">
            <span>صفحة {page} من {new Intl.NumberFormat("en-US").format(pages)}</span>
            <div className="flex gap-1">
              <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-50" : ""}><a href={href(page - 1)}>السابق</a></Button>
              <Button asChild variant="outline" size="sm" className={page >= pages ? "pointer-events-none opacity-50" : ""}><a href={href(page + 1)}>التالي</a></Button>
            </div>
          </div>
        )}
      </Card>
      <p className="mt-3 text-[11px] text-muted-foreground">البيانات مصدرها Encar.com عبر مزوّد مستقل (autokoreablendi) غير تابع لـ Encar. الأسعار المعروضة أسعار الإعلان بالوون وقد تتغير؛ التقدير بالريال يعتمد على سعر الصرف المحفوظ.</p>
    </div>
  );
}
