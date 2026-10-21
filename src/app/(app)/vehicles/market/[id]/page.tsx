import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, Globe2 } from "lucide-react";
import { pageCompanyContext } from "@/lib/context";
import { EncarError, getCar } from "@/lib/encar/client";
import { convert } from "@/lib/encar/normalize";
import { importedListings, latestKrwRate } from "@/server/queries/encar";
import { activityOptions, cashAccountOptions, supplierOptions } from "@/server/queries/options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, KeyValue, PageHeader } from "@/components/ui/misc";
import { ImportEncarDialog } from "@/components/encar/import-dialog";
import { SafeImg } from "@/components/encar/safe-img";
import { formatMoney } from "@/lib/money";

const n = (v: number) => new Intl.NumberFormat("en-US").format(v);

export default async function EncarCarPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageCompanyContext("vehicles.read");
  const { id } = await params;
  if (!/^\d{4,12}$/.test(id)) notFound();
  let car;
  try {
    car = await getCar(id);
  } catch (e) {
    return (
      <Card className="mt-6">
        <EmptyState icon={AlertTriangle} title="تعذر عرض الإعلان" description={e instanceof EncarError ? e.message : "حدث خطأ أثناء جلب الإعلان"}
          action={<Button asChild variant="outline"><Link href="/vehicles/market">العودة للسوق</Link></Button>} />
      </Card>
    );
  }
  const [rate, imported] = await Promise.all([latestKrwRate(ctx), importedListings(ctx, [car.id])]);
  const vehicleId = imported.get(car.id);
  const base = convert(car.priceKrw, rate);
  const canImport = ctx.permissions.has("vehicles.create") && !vehicleId;

  return (
    <div className="space-y-6">
      <PageHeader title={car.title} description={`إعلان Encar رقم ${car.id}`} icon={Globe2}
        actions={<>
          <Button asChild variant="outline"><a href={car.encarUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> فتح في Encar</a></Button>
          {vehicleId && <Button asChild variant="secondary"><Link href={`/vehicles/${vehicleId}`}><CheckCircle2 /> موجودة في المخزون</Link></Button>}
          {canImport && <ImportEncarDialog listingId={car.id} priceKrw={car.priceKrw?.toFixed(0) ?? null} defaultRate={rate} baseCurrency={ctx.company.baseCurrency}
            activities={await activityOptions(ctx, "VEHICLES")} suppliers={await supplierOptions(ctx)} cashAccounts={await cashAccountOptions(ctx)} />}
        </>} />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          {car.photos.length ? (
            <div className="grid gap-1 p-1 sm:grid-cols-2">
              {car.photos.slice(0, 10).map((src, i) => (
                <SafeImg key={src} src={src} alt={`${car.title} ${i + 1}`} loading={i < 2 ? "eager" : "lazy"} className={`w-full rounded-lg object-cover ${i === 0 ? "aspect-[4/3] sm:col-span-2" : "aspect-[4/3]"}`} />
              ))}
            </div>
          ) : <EmptyState title="لا توجد صور" />}
        </Card>
        <div className="space-y-6">
          <Card className="border-gold/40">
            <CardHeader><CardTitle>السعر</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <p className="num text-3xl font-extrabold">{car.priceKrw ? `${n(Number(car.priceKrw.toFixed(0)))} ₩` : "غير معلن"}</p>
              {base && <p className="num text-sm text-muted-foreground">≈ {formatMoney(base, ctx.company.baseCurrency)} (بسعر {rate})</p>}
              {car.previousPriceKrw && <Badge variant="success">انخفض من {n(Number(car.previousPriceKrw.toFixed(0)))} ₩</Badge>}
              <p className="pt-2 text-xs text-muted-foreground">سعر الإعلان في كوريا قبل الشحن والجمارك والضريبة.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>المواصفات</CardTitle></CardHeader>
            <CardContent>
              <KeyValue className="sm:grid-cols-2 lg:grid-cols-2" items={[
                ["الشركة المصنعة", car.manufacturer], ["الطراز", car.model], ["الفئة", car.badge], ["سنة الموديل", car.year],
                ["أول تسجيل", car.registered], ["الممشى", car.mileageKm !== null ? `${n(car.mileageKm)} كم` : null],
                ["الوقود", car.fuel], ["القوة", car.powerPs ? `${car.powerPs} حصان` : null], ["المدينة", car.region],
                ["فحص Encar", car.hasInspection ? "متوفر" : "غير متوفر"], ["سجل الحوادث", car.hasAccidentRecord ? "متوفر" : "غير متوفر"],
              ]} />
              <p className="mt-4 text-xs text-muted-foreground">لا يوفر المزوّد رقم الهيكل (VIN) ولا ناقل الحركة أو اللون؛ أضفها في صفحة السيارة بعد الاستيراد.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
