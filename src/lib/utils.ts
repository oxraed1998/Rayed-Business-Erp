import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }).format(new Date(d)) : "—";

export const isoDate = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export const today = () => new Date().toISOString().slice(0, 10);

export const fmtNumber = (v: number | string | { toString(): string }, digits = 0) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(v.toString()));
