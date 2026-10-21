import { NextResponse, type NextRequest } from "next/server";
import { ACTION_MODULES, PUBLIC_ACTIONS } from "@/server/action-registry";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const MAX_BODY = 1_000_000;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/** CSRF defence: only accept same-origin browser requests (SameSite=Lax cookies are the second layer). */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ module: string; name: string }> }) {
  const { module, name } = await params;
  const mod = Object.hasOwn(ACTION_MODULES, module) ? ACTION_MODULES[module] : undefined;
  const fn = mod && Object.hasOwn(mod, name) ? mod[name] : undefined;
  if (typeof fn !== "function") return json({ ok: false, error: "إجراء غير معروف" }, 404);
  if (!sameOrigin(req)) return json({ ok: false, error: "طلب مرفوض" }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ ok: false, error: "حجم البيانات كبير جدًا" }, 413);
  if (!PUBLIC_ACTIONS.has(`${module}.${name}`) && !(await getSession())) return json({ ok: false, error: "انتهت الجلسة، يرجى تسجيل الدخول مجددًا" }, 401);

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return json({ ok: false, error: "بيانات غير صالحة" }, 400);
  }
  try {
    const result = await (fn as (prev: null, fd: FormData) => Promise<unknown>)(null, fd);
    return json(result ?? { ok: true });
  } catch (e) {
    console.error(`[action ${module}.${name}]`, e);
    return json({ ok: false, error: "حدث خطأ غير متوقع. حاول مرة أخرى." }, 500);
  }
}
