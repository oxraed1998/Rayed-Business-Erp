import { D, Decimal, money, type DecimalLike } from "@/lib/money";

/** Raw listing as returned by autokoreablendi.com/api (a proxy of Encar.com data). */
export interface RawEncarCar {
  Id: string;
  Manufacturer?: string;
  Model?: string;
  Badge?: string;
  FuelType?: string;
  Year?: number;
  FormYear?: string;
  Mileage?: number;
  /** Price in units of 10,000 KRW (만원). */
  Price?: number;
  OfficeCityState?: string;
  Photo?: string;
  Photos?: { type: string; location: string; ordering?: number }[];
  powerPs?: number | null;
  powerKw?: number | null;
  Condition?: string[];
  Trust?: string[];
  SellType?: string;
  priceDrop?: { previousPrice?: number; droppedAt?: string } | null;
  en?: { manufacturer?: string; modelGroup?: string; model?: string; badge?: string | null; title?: string; fuelType?: string | null; region?: string | null } | null;
}

export interface EncarCar {
  id: string;
  title: string;
  manufacturer: string;
  model: string;
  badge: string | null;
  /** Model year (FormYear), falling back to the registration year. */
  year: number | null;
  /** First registration as YYYY-MM. */
  registered: string | null;
  mileageKm: number | null;
  fuel: string | null;
  powerPs: number | null;
  region: string | null;
  /** Full price in KRW. */
  priceKrw: Decimal | null;
  previousPriceKrw: Decimal | null;
  photos: string[];
  hasInspection: boolean;
  hasAccidentRecord: boolean;
  encarUrl: string;
}

const PHOTO_BASE = "https://ci.encar.com";
const MANWON = 10_000;

const toPhotoUrl = (loc: string) => (loc.startsWith("http") ? loc : `${PHOTO_BASE}${loc.startsWith("/") ? "" : "/"}${loc}`);

/** Normalises the proxy's raw fields; units and formats are converted here and nowhere else. */
export function normalizeCar(raw: RawEncarCar): EncarCar {
  const yyyymm = raw.Year && /^\d{6}$/.test(String(raw.Year)) ? String(raw.Year) : null;
  const formYear = raw.FormYear && /^\d{4}$/.test(raw.FormYear) ? Number(raw.FormYear) : null;
  const photos = [...(raw.Photos ?? [])]
    .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
    .map((p) => toPhotoUrl(p.location));
  if (!photos.length && raw.Photo) photos.push(toPhotoUrl(`${raw.Photo}001.jpg`));
  const manufacturer = raw.en?.manufacturer || raw.Manufacturer || "";
  const model = raw.en?.model || raw.Model || "";
  const badge = raw.en?.badge || raw.Badge || null;
  return {
    id: String(raw.Id),
    title: raw.en?.title || [manufacturer, model, badge].filter(Boolean).join(" "),
    manufacturer,
    model,
    badge,
    year: formYear ?? (yyyymm ? Number(yyyymm.slice(0, 4)) : null),
    registered: yyyymm ? `${yyyymm.slice(0, 4)}-${yyyymm.slice(4)}` : null,
    mileageKm: typeof raw.Mileage === "number" ? raw.Mileage : null,
    fuel: raw.en?.fuelType || raw.FuelType || null,
    powerPs: raw.powerPs ?? null,
    region: raw.en?.region || raw.OfficeCityState || null,
    priceKrw: typeof raw.Price === "number" && raw.Price > 0 ? D(raw.Price).times(MANWON) : null,
    previousPriceKrw: raw.priceDrop?.previousPrice ? D(raw.priceDrop.previousPrice).times(MANWON) : null,
    photos,
    hasInspection: Boolean(raw.Condition?.includes("Inspection")),
    hasAccidentRecord: Boolean(raw.Condition?.includes("Record")),
    encarUrl: `https://fem.encar.com/cars/detail/${encodeURIComponent(String(raw.Id))}`,
  };
}

/** The proxy filters price in EUR using EUR ≈ Price(만원) × 6.7; convert a KRW bound to its filter value. */
export const krwToProxyEur = (krw: DecimalLike) => D(krw).div(MANWON).times("6.7").toDecimalPlaces(0, Decimal.ROUND_DOWN).toString();

export const convert = (krw: Decimal | null, rate: DecimalLike | null | undefined) => (krw && rate && D(rate).gt(0) ? money(krw.times(D(rate))) : null);

export const ENCAR_MANUFACTURERS = [
  "Hyundai", "Kia", "Genesis", "Chevrolet", "Renault Korea", "KG Mobility", "BMW", "Mercedes-Benz", "Audi", "Volkswagen",
  "Porsche", "Lexus", "Toyota", "Tesla", "Volvo", "Land Rover", "Mini", "Ford",
] as const;

export const ENCAR_FUELS: Record<string, string> = { Gasoline: "بنزين", Diesel: "ديزل", Electric: "كهربائي" };
