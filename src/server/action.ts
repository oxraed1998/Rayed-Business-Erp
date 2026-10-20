import "server-only";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { actionCompanyContext, actionContext, AuthError, type CompanyContext, type TenantContext } from "@/lib/context";
import type { Permission } from "@/lib/permissions";
import { JournalError } from "@/lib/accounting/journal";
import { ServiceError, type Actor } from "@/server/services/actor";

export type ActionResult = { ok: true; message?: string; redirect?: string; data?: Record<string, string> } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Turns FormData into a nested object: `lines.0.qty` → { lines: [{ qty }] }. Empty strings become undefined. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, rawVal] of fd.entries()) {
    if (rawKey.startsWith("$ACTION")) continue;
    const val = typeof rawVal === "string" ? (rawVal.trim() === "" ? undefined : rawVal) : rawVal;
    const path = rawKey.replace(/\[(\w+)\]/g, ".$1").split(".");
    let cur: Record<string, unknown> | unknown[] = out;
    path.forEach((seg, i) => {
      const last = i === path.length - 1;
      const nextIsIndex = /^\d+$/.test(path[i + 1] ?? "");
      const key: string | number = /^\d+$/.test(seg) ? Number(seg) : seg;
      const container = cur as Record<string | number, unknown>;
      if (last) {
        if (rawKey.endsWith("[]")) return;
        if (container[key] !== undefined && !Array.isArray(cur)) {
          container[key] = ([] as unknown[]).concat(container[key], val);
        } else container[key] = val;
      } else {
        container[key] ??= nextIsIndex ? [] : {};
        cur = container[key] as Record<string, unknown>;
      }
    });
  }
  // Drop holes / fully-empty rows from arrays (e.g. unused invoice lines).
  const clean = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.filter((x) => x !== undefined && !(typeof x === "object" && x && Object.values(x).every((y) => y === undefined))).map(clean);
    if (v && typeof v === "object" && !(v instanceof File)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
    return v;
  };
  return clean(out) as Record<string, unknown>;
}

function toMessage(e: unknown): string {
  if (e instanceof AuthError) {
    return { UNAUTHENTICATED: "انتهت الجلسة، يرجى تسجيل الدخول مجددًا", FORBIDDEN: "ليست لديك صلاحية لتنفيذ هذا الإجراء", NO_TENANT: "لا توجد منشأة مرتبطة بحسابك", NO_COMPANY: "أنشئ شركة أولًا من الإعدادات" }[e.code];
  }
  if (e instanceof ServiceError || e instanceof JournalError || (e instanceof Error && e.constructor.name.endsWith("Error") && /[؀-ۿ]/.test(e.message))) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return "القيمة مستخدمة مسبقًا (تكرار غير مسموح)";
    if (e.code === "P2003") return "مرجع غير صالح";
    if (e.code === "P2025") return "السجل غير موجود";
  }
  if (e instanceof Error && /immutable|not balanced|append-only/.test(e.message)) return "العملية مرفوضة: القيود المرحلة لا يمكن تعديلها";
  console.error("[action] unexpected error", e);
  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

interface Options<S extends z.ZodTypeAny> {
  schema: S;
  permission?: Permission;
  /** Requires a selected company (default true). */
  company?: boolean;
  revalidate?: string[];
}

type Handler<S extends z.ZodTypeAny, C> = (args: { tx: Tx; data: z.output<S>; ctx: C; actor: Actor }) => Promise<void | string | Omit<Extract<ActionResult, { ok: true }>, "ok">>;

export function companyAction<S extends z.ZodTypeAny>(opts: Options<S>, handler: Handler<S, CompanyContext>) {
  return async (_prev: ActionResult | null, fd: FormData): Promise<ActionResult> => run(opts, fd, true, handler as Handler<S, TenantContext>);
}

export function tenantAction<S extends z.ZodTypeAny>(opts: Options<S>, handler: Handler<S, TenantContext>) {
  return async (_prev: ActionResult | null, fd: FormData): Promise<ActionResult> => run(opts, fd, false, handler);
}

async function run<S extends z.ZodTypeAny>(opts: Options<S>, fd: FormData, needCompany: boolean, handler: Handler<S, TenantContext>): Promise<ActionResult> {
  try {
    const ctx = needCompany ? await actionCompanyContext(opts.permission) : await actionContext(opts.permission);
    if (!ctx.membership.isActive) throw new AuthError("FORBIDDEN");
    const parsed = opts.schema.safeParse(formToObject(fd));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
      const first = parsed.error.issues[0];
      return { ok: false, error: `تحقق من الحقول: ${first.message}`, fieldErrors };
    }
    const actor: Actor = { tenantId: ctx.tenant.id, companyId: ctx.company?.id ?? "", userId: ctx.user.id };
    const result = await db.$transaction((tx) => handler({ tx, data: parsed.data, ctx, actor }), { timeout: 30000, isolationLevel: "ReadCommitted" });
    for (const p of opts.revalidate ?? ["/", "/(app)"]) revalidatePath(p, "layout");
    if (typeof result === "string") return { ok: true, message: result };
    return { ok: true, ...(result ?? {}) };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}
