import type { Option } from "@/server/queries/options";

export const PLAN_OPTS: Option[] = [{ value: "FREE", label: "مجاني" }, { value: "STARTER", label: "المبتدئ" }, { value: "BUSINESS", label: "الأعمال" }, { value: "ENTERPRISE", label: "المؤسسات" }];
export const STATUS_OPTS: Option[] = [{ value: "TRIALING", label: "تجريبي" }, { value: "ACTIVE", label: "نشط" }, { value: "PAST_DUE", label: "متأخر السداد" }, { value: "CANCELLED", label: "ملغى" }, { value: "EXPIRED", label: "منتهي" }];
