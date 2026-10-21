import { describe, expect, it } from "vitest";
import { convert, krwToProxyEur, normalizeCar } from "@/lib/encar/normalize";

const raw = {
  Id: "42864519",
  Manufacturer: "현대", Model: "아반떼 (CN7)", Badge: "2.0 N", FuelType: "가솔린",
  Year: 202306, FormYear: "2023", Mileage: 26263, Price: 2350, OfficeCityState: "부산",
  Photo: "/carpicture06/pic4286/42860151_",
  Photos: [
    { type: "003", location: "/carpicture06/pic4286/42860151_003.jpg", ordering: 3 },
    { type: "001", location: "/carpicture06/pic4286/42860151_001.jpg", ordering: 1 },
  ],
  powerPs: 280, Condition: ["Inspection", "Record"],
  en: { manufacturer: "Hyundai", model: "Avante (CN7)", badge: "2.0 N", title: "Hyundai Avante (CN7) 2.0 N", fuelType: "Gasoline", region: "Busan" },
};

describe("Encar normalisation", () => {
  it("converts units and prefers English names", () => {
    const c = normalizeCar(raw);
    expect(c.title).toBe("Hyundai Avante (CN7) 2.0 N");
    expect(c.priceKrw!.toString()).toBe("23500000");
    expect(c.year).toBe(2023);
    expect(c.registered).toBe("2023-06");
    expect(c.region).toBe("Busan");
    expect(c.photos[0]).toBe("https://ci.encar.com/carpicture06/pic4286/42860151_001.jpg");
    expect(c.encarUrl).toBe("https://fem.encar.com/cars/detail/42864519");
    expect(c.hasInspection && c.hasAccidentRecord).toBe(true);
  });
  it("falls back to Korean fields and the base photo", () => {
    const c = normalizeCar({ Id: "1", Manufacturer: "기아", Model: "K5", Year: 202104, Photo: "/p/1_", Price: 0 });
    expect(c.manufacturer).toBe("기아");
    expect(c.year).toBe(2021);
    expect(c.priceKrw).toBeNull();
    expect(c.photos).toEqual(["https://ci.encar.com/p/1_001.jpg"]);
  });
  it("converts KRW bounds to the proxy's EUR filter and to SAR", () => {
    expect(krwToProxyEur(16_900_000)).toBe("11323");
    expect(convert(normalizeCar(raw).priceKrw, "0.0027")!.toFixed(2)).toBe("63450.00");
    expect(convert(normalizeCar(raw).priceKrw, null)).toBeNull();
  });
});
