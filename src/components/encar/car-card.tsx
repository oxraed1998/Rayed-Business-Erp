import Link from "next/link";
import { Gauge, MapPin, Fuel, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SafeImg } from "./safe-img";
import type { EncarCar } from "@/lib/encar/normalize";
import { convert } from "@/lib/encar/normalize";
import { formatMoney } from "@/lib/money";

const krw = (v: { toString(): string } | null) => (v ? `${new Intl.NumberFormat("en-US").format(Number(v.toString()))} ₩` : "السعر غير معلن");

export function EncarCarCard({ car, rate, baseCurrency, imported }: { car: EncarCar; rate: string | null; baseCurrency: string; imported: boolean }) {
  const base = convert(car.priceKrw, rate);
  return (
    <Link href={`/vehicles/market/${car.id}`} className="group overflow-hidden rounded-xl border bg-card shadow-soft transition-shadow hover:shadow-lift">
      <div className="relative aspect-[4/3] bg-muted">
        {car.photos[0] ? (
          <SafeImg src={car.photos[0]} alt={car.title} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
        ) : <div className="grid size-full place-items-center text-xs text-muted-foreground">لا توجد صورة</div>}
        {imported && <Badge variant="success" className="absolute right-2 top-2"><CheckCircle2 className="size-3" /> في المخزون</Badge>}
      </div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5" dir="ltr">{car.title}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {car.year && <span>{car.year}</span>}
          {car.mileageKm !== null && <span className="flex items-center gap-1"><Gauge className="size-3" />{new Intl.NumberFormat("en-US").format(car.mileageKm)} كم</span>}
          {car.fuel && <span className="flex items-center gap-1"><Fuel className="size-3" />{car.fuel}</span>}
          {car.region && <span className="flex items-center gap-1"><MapPin className="size-3" />{car.region}</span>}
        </div>
        <div className="flex items-end justify-between gap-2 border-t pt-2">
          <span className="num text-sm font-extrabold">{krw(car.priceKrw)}</span>
          {base && <span className="num text-xs text-muted-foreground">≈ {formatMoney(base, baseCurrency)}</span>}
        </div>
      </div>
    </Link>
  );
}
