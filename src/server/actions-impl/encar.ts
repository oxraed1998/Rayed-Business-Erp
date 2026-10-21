import "server-only";
import { z } from "zod";
import { companyAction } from "@/server/action";
import { createVehicle } from "@/server/services/vehicles";
import { ServiceError, zDate, zOptId, zOptText, zPositiveMoney, zRate } from "@/server/services/actor";
import { EncarError, getCar } from "@/lib/encar/client";
import { D } from "@/lib/money";

const settlement = z.object({ accountId: z.string().min(1, "اختر طريقة السداد"), supplierId: zOptId });

/**
 * Imports an Encar listing into the vehicle inventory. The listing is re-fetched on the
 * server so the stored data comes from Encar, not from the browser.
 */
export const importEncarVehicleAction = companyAction(
  {
    permission: "vehicles.create",
    schema: z.object({
      listingId: z.string().regex(/^\d{4,12}$/, "رقم إعلان غير صالح"),
      purchasePrice: zPositiveMoney,
      exchangeRate: zRate,
      purchaseDate: zDate,
      activityId: zOptId,
      supplierId: zOptId,
      notes: zOptText(1000),
      settlement,
    }),
  },
  async ({ tx, data, actor }) => {
    let car;
    try {
      car = await getCar(data.listingId);
    } catch (e) {
      throw new ServiceError(e instanceof EncarError ? e.message : "تعذر جلب الإعلان من Encar");
    }
    if (!car.year) throw new ServiceError("سنة الصنع غير متوفرة في الإعلان");
    const v = await createVehicle(tx, actor, {
      manufacturer: car.manufacturer.slice(0, 60),
      model: [car.model, car.badge].filter(Boolean).join(" ").slice(0, 60),
      year: car.year,
      mileage: car.mileageKm,
      originCountry: "كوريا الجنوبية",
      importCountry: "كوريا الجنوبية",
      purchaseDate: data.purchaseDate,
      purchaseCurrency: "KRW",
      purchasePrice: data.purchasePrice,
      exchangeRate: data.exchangeRate,
      activityId: data.activityId,
      supplierId: data.supplierId,
      sourceRef: `encar:${car.id}`,
      notes: [
        `مستورد من Encar — إعلان رقم ${car.id}`,
        car.encarUrl,
        car.priceKrw ? `سعر الإعلان: ${car.priceKrw.toFixed(0)} KRW` : null,
        car.registered ? `أول تسجيل: ${car.registered}` : null,
        car.fuel ? `الوقود: ${car.fuel}` : null,
        data.notes,
      ].filter(Boolean).join("\n"),
      settlement: data.settlement,
    });
    // Remember the KRW rate used so the next import defaults to it.
    const day = new Date(Date.UTC(data.purchaseDate.getUTCFullYear(), data.purchaseDate.getUTCMonth(), data.purchaseDate.getUTCDate()));
    await tx.exchangeRate.upsert({
      where: { companyId_currency_date: { companyId: actor.companyId, currency: "KRW", date: day } },
      create: { tenantId: actor.tenantId, companyId: actor.companyId, currency: "KRW", rate: D(data.exchangeRate).toFixed(6), date: day },
      update: { rate: D(data.exchangeRate).toFixed(6) },
    });
    return { message: "تم استيراد السيارة إلى المخزون وترحيل قيد الشراء", redirect: `/vehicles/${v.id}` };
  },
);
