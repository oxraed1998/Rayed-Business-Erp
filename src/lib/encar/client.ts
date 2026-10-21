import "server-only";
import { krwToProxyEur, normalizeCar, type EncarCar, type RawEncarCar } from "./normalize";

const BASE = "https://autokoreablendi.com/api";
const TIMEOUT_MS = 12_000;
const SEARCH_TTL_MS = 5 * 60_000;
const CAR_TTL_MS = 15 * 60_000;
const MAX_CACHE = 300;

export class EncarError extends Error {
  constructor(public code: "QUOTA" | "UNAUTHORIZED" | "NOT_FOUND" | "UNAVAILABLE" | "BAD_RESPONSE", message: string) {
    super(message);
  }
}

export interface Quota { limit: number; remaining: number; resetAt: string | null; checkedAt: string }

// Per-process caches: they save the provider's daily quota when users page back and forth.
const cache = new Map<string, { at: number; ttl: number; data: unknown }>();
let lastQuota: Quota | null = null;

export const encarConfigured = () => Boolean(process.env.ENCAR_API_KEY);
export const encarQuota = () => lastQuota;

function remember(key: string, ttl: number, data: unknown) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), ttl, data });
}

async function request<T>(path: string, params: URLSearchParams, ttl: number): Promise<T> {
  const key = `${path}?${params}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.data as T;

  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.ENCAR_API_KEY) headers["x-api-key"] = process.env.ENCAR_API_KEY;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}?${params}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new EncarError("UNAVAILABLE", "تعذر الاتصال بخدمة Encar حاليًا. حاول بعد قليل.");
  }
  const limit = Number(res.headers.get("x-ratelimit-limit"));
  if (Number.isFinite(limit) && limit > 0) {
    const reset = res.headers.get("x-ratelimit-reset");
    lastQuota = {
      limit,
      remaining: Number(res.headers.get("x-ratelimit-remaining") ?? 0),
      resetAt: reset ? (/^\d+$/.test(reset) ? new Date(Number(reset) * (reset.length > 10 ? 1 : 1000)).toISOString() : reset) : null,
      checkedAt: new Date().toISOString(),
    };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* handled below */
  }
  if (res.status === 429) throw new EncarError("QUOTA", "انتهت الحصة اليومية لطلبات Encar. تتجدد الحصة يوميًا (منتصف الليل UTC) أو بترقية الاشتراك.");
  if (res.status === 401 || res.status === 403) throw new EncarError("UNAUTHORIZED", "مفتاح Encar غير صالح أو غير مفعّل. تحقق من المتغير ENCAR_API_KEY.");
  if (res.status === 404 || (body as { error?: string })?.error === "SOLD_OR_REMOVED") throw new EncarError("NOT_FOUND", "الإعلان غير موجود أو تم بيعه وحذفه من Encar.");
  if (!res.ok || !body) throw new EncarError(res.status === 502 && path === "/car" ? "NOT_FOUND" : "UNAVAILABLE", res.status === 502 && path === "/car" ? "تعذر العثور على الإعلان في Encar (قد يكون بيع أو حُذف)." : "خدمة Encar لم تستجب بشكل صحيح. حاول لاحقًا.");
  remember(key, ttl, body);
  return body as T;
}

export interface EncarSearch {
  manufacturer?: string;
  model?: string;
  fuel?: string;
  yearFrom?: number;
  yearTo?: number;
  priceFromKrw?: number;
  priceToKrw?: number;
  sort?: "priceAsc" | "priceDesc";
  page?: number;
  count?: number;
}

export async function searchCars(s: EncarSearch): Promise<{ total: number; page: number; count: number; cars: EncarCar[] }> {
  const p = new URLSearchParams();
  if (s.manufacturer) p.set("manufacturer", s.manufacturer);
  if (s.model) p.set("model", s.model);
  if (s.fuel) p.set("fuel", s.fuel);
  if (s.yearFrom) p.set("yearFrom", String(s.yearFrom));
  if (s.yearTo) p.set("yearTo", String(s.yearTo));
  if (s.priceFromKrw) p.set("priceFrom", krwToProxyEur(s.priceFromKrw));
  if (s.priceToKrw) p.set("priceTo", krwToProxyEur(s.priceToKrw));
  if (s.sort) p.set("sort", s.sort);
  p.set("page", String(Math.max(0, s.page ?? 0)));
  p.set("count", String(Math.min(48, Math.max(1, s.count ?? 24))));
  const body = await request<{ total?: number; page?: number; count?: number; results?: RawEncarCar[]; cars?: RawEncarCar[] }>("/cars", p, SEARCH_TTL_MS);
  const list = body.results ?? body.cars;
  if (!Array.isArray(list)) throw new EncarError("BAD_RESPONSE", "استجابة غير متوقعة من خدمة Encar.");
  return { total: Number(body.total ?? list.length), page: Number(body.page ?? s.page ?? 0), count: list.length, cars: list.filter((r) => r && r.Id).map(normalizeCar) };
}

export async function getCar(id: string): Promise<EncarCar> {
  if (!/^\d{4,12}$/.test(id)) throw new EncarError("NOT_FOUND", "رقم إعلان غير صالح");
  const body = await request<RawEncarCar & { error?: string }>("/car", new URLSearchParams({ id }), CAR_TTL_MS);
  if (!body?.Id) throw new EncarError("NOT_FOUND", "الإعلان غير موجود أو تم بيعه وحذفه من Encar.");
  return normalizeCar(body);
}
