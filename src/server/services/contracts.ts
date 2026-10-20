import type { ContractStatus, ContractType } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { toDb, type DecimalLike } from "@/lib/money";
import { nextNumber } from "@/lib/sequence";
import { NotFound, ServiceError, type Actor } from "./actor";

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  IMPORT: "عقد استيراد",
  PURCHASE: "عقد شراء",
  SALES: "عقد بيع",
  PARTNERSHIP: "اتفاقية شراكة",
  INVESTMENT: "اتفاقية استثمار",
  SUPPLIER: "عقد توريد",
  EMPLOYMENT: "عقد عمل",
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: "مسودة",
  PENDING_APPROVAL: "بانتظار الاعتماد",
  ACTIVE: "نافذ",
  EXPIRED: "منتهي",
  TERMINATED: "منهى",
};

/** Built-in Arabic body templates. Placeholders are filled in by the user before approval. */
export const CONTRACT_TEMPLATES: Record<ContractType, string> = {
  IMPORT: `إنه في يوم ............ تم الاتفاق بين:
الطرف الأول (المستورد): ............
الطرف الثاني (المصدّر): ............
على أن يقوم الطرف الثاني بتوريد البضائع الموضحة أدناه وفق الشروط التالية:
١. وصف البضاعة والكمية: ............
٢. القيمة الإجمالية وعملة السداد: وفق قيمة العقد المذكورة.
٣. شروط التسليم (Incoterms): ............
٤. ميناء الشحن وميناء الوصول: ............
٥. يتحمل الطرف ............ مصاريف الشحن والتأمين والتخليص الجمركي.
٦. شروط الدفع: وفق شروط الدفع المذكورة في هذا العقد.
٧. يخضع هذا العقد لأنظمة المملكة العربية السعودية.`,
  PURCHASE: `تم الاتفاق بين الطرف الأول (المشتري) والطرف الثاني (البائع) على شراء ما يلي:
١. وصف محل العقد: ............
٢. الثمن الإجمالي: وفق قيمة العقد.
٣. موعد ومكان التسليم: ............
٤. الضمانات: ............
٥. يقر البائع بخلو المبيع من أي حقوق للغير.`,
  SALES: `تم الاتفاق بين الطرف الأول (البائع) والطرف الثاني (المشتري) على بيع ما يلي:
١. وصف المبيع: ............
٢. الثمن الإجمالي شاملًا ضريبة القيمة المضافة: وفق قيمة العقد.
٣. طريقة السداد: وفق شروط الدفع (نقدًا / تقسيطًا).
٤. في حال البيع بالتقسيط تبقى ملكية المبيع للبائع حتى سداد كامل الأقساط ما لم يُتفق على غير ذلك.
٥. يقر المشتري بمعاينة المبيع معاينة نافية للجهالة.`,
  PARTNERSHIP: `اتفق الشركاء الموقعون أدناه على الدخول في شراكة في النشاط: ............
١. رأس مال الشراكة ومساهمة كل شريك: ............
٢. نسب توزيع الأرباح والخسائر: ............ (قد تختلف عن نسب رأس المال)
٣. الإدارة والصلاحيات: ............
٤. مدة الشراكة وطريقة التخارج: ............
٥. تُمسك حسابات الشراكة في نظام رائد للأعمال وتعتبر قيوده مرجعًا للتسوية.`,
  INVESTMENT: `اتفق الطرف الأول (المستثمر) والطرف الثاني (الشركة) على ما يلي:
١. مبلغ الاستثمار: وفق قيمة العقد.
٢. مجال الاستثمار: ............
٣. نسبة المستثمر من الأرباح: ............ وتحمل الخسائر: ............
٤. مدة الاستثمار ومواعيد التوزيع: ............
٥. آلية استرداد رأس المال: ............`,
  SUPPLIER: `اتفق الطرف الأول (الشركة) والطرف الثاني (المورد) على توريد ما يلي بشكل دوري:
١. الأصناف والمواصفات: ............
٢. الأسعار ومدة سريانها: ............
٣. مواعيد التوريد: ............
٤. شروط الدفع: وفق شروط الدفع المذكورة.
٥. غرامات التأخير: ............`,
  EMPLOYMENT: `تم الاتفاق بين صاحب العمل والعامل الموضح بياناته على ما يلي وفق نظام العمل السعودي:
١. المسمى الوظيفي ومكان العمل: ............
٢. الأجر الأساسي والبدلات: ............
٣. مدة العقد وفترة التجربة: ............
٤. ساعات العمل والإجازات: وفق نظام العمل.
٥. مكافأة نهاية الخدمة: وفق نظام العمل.`,
};

export interface ContractInput {
  type: ContractType;
  title: string;
  parties: string;
  startDate: Date;
  endDate?: Date | null;
  value: DecimalLike;
  currency: string;
  paymentTerms?: string | null;
  body?: string | null;
  renewalReminderDays: number;
}

function validate(input: ContractInput) {
  if (input.endDate && input.endDate < input.startDate) throw new ServiceError("تاريخ النهاية قبل تاريخ البداية");
}

async function getContract(tx: Tx, actor: Actor, id: string) {
  const c = await tx.contract.findFirst({ where: { id, tenantId: actor.tenantId, companyId: actor.companyId } });
  if (!c) throw NotFound("العقد");
  return c;
}

export async function createContract(tx: Tx, actor: Actor, input: ContractInput) {
  validate(input);
  const number = await nextNumber(tx, actor.tenantId, actor.companyId, "CONTRACT");
  const c = await tx.contract.create({
    data: {
      tenantId: actor.tenantId, companyId: actor.companyId, number, type: input.type, title: input.title, parties: input.parties,
      startDate: input.startDate, endDate: input.endDate ?? null, value: toDb(input.value), currency: input.currency,
      paymentTerms: input.paymentTerms ?? null, body: input.body ?? CONTRACT_TEMPLATES[input.type], renewalReminderDays: input.renewalReminderDays,
      createdById: actor.userId,
    },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "create", entity: "Contract", entityId: c.id, data: { number, type: c.type } });
  return c;
}

export async function updateContract(tx: Tx, actor: Actor, id: string, input: ContractInput) {
  const c = await getContract(tx, actor, id);
  if (c.status !== "DRAFT") throw new ServiceError("يمكن تعديل العقد وهو مسودة فقط");
  validate(input);
  await tx.contract.update({
    where: { id: c.id },
    data: {
      type: input.type, title: input.title, parties: input.parties, startDate: input.startDate, endDate: input.endDate ?? null,
      value: toDb(input.value), currency: input.currency, paymentTerms: input.paymentTerms ?? null, body: input.body ?? null, renewalReminderDays: input.renewalReminderDays,
    },
  });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "update", entity: "Contract", entityId: c.id });
}

export async function submitContract(tx: Tx, actor: Actor, id: string) {
  const c = await getContract(tx, actor, id);
  if (c.status !== "DRAFT") throw new ServiceError("العقد ليس مسودة");
  await tx.contract.update({ where: { id: c.id }, data: { status: "PENDING_APPROVAL" } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "submit", entity: "Contract", entityId: c.id });
}

export async function approveContract(tx: Tx, actor: Actor, id: string) {
  const c = await getContract(tx, actor, id);
  if (c.status !== "PENDING_APPROVAL") throw new ServiceError("العقد ليس بانتظار الاعتماد");
  await tx.contract.update({ where: { id: c.id }, data: { status: "ACTIVE", approvedById: actor.userId, approvedAt: new Date() } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "approve", entity: "Contract", entityId: c.id });
}

/** Returns a pending contract to draft for corrections. */
export async function rejectContract(tx: Tx, actor: Actor, id: string) {
  const c = await getContract(tx, actor, id);
  if (c.status !== "PENDING_APPROVAL") throw new ServiceError("العقد ليس بانتظار الاعتماد");
  await tx.contract.update({ where: { id: c.id }, data: { status: "DRAFT" } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "reject", entity: "Contract", entityId: c.id });
}

export async function terminateContract(tx: Tx, actor: Actor, id: string) {
  const c = await getContract(tx, actor, id);
  if (c.status !== "ACTIVE") throw new ServiceError("يمكن إنهاء العقود النافذة فقط");
  await tx.contract.update({ where: { id: c.id }, data: { status: "TERMINATED" } });
  await audit(tx, { tenantId: actor.tenantId, companyId: actor.companyId, userId: actor.userId, action: "terminate", entity: "Contract", entityId: c.id });
}

/** Effective status: active contracts past their end date read as expired. */
export function effectiveStatus(c: { status: ContractStatus; endDate: Date | null }, today = new Date()): ContractStatus {
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return c.status === "ACTIVE" && c.endDate && c.endDate < t ? "EXPIRED" : c.status;
}

export function renewalDue(c: { status: ContractStatus; endDate: Date | null; renewalReminderDays: number }, today = new Date()) {
  if (c.status !== "ACTIVE" || !c.endDate) return false;
  const days = (c.endDate.getTime() - today.getTime()) / 86400000;
  return days >= -1 && days <= c.renewalReminderDays;
}
