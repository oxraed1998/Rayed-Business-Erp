import type { ActionResult } from "@/server/action";

/**
 * Client-callable action: POSTs the form to /api/actions/<module>/<name>, which runs the
 * server implementation (auth, permissions, validation, transaction) and returns JSON.
 * Same signature as a React form action, so it works with useActionState and our forms.
 */
export function remoteAction(module: string, name: string) {
  return async (_prev?: ActionResult | null, fd?: FormData): Promise<ActionResult> => {
    try {
      const res = await fetch(`/api/actions/${module}/${name}`, { method: "POST", body: fd ?? new FormData(), credentials: "same-origin" });
      if (res.status === 401) return { ok: false, error: "انتهت الجلسة، يرجى تسجيل الدخول مجددًا" };
      const data = (await res.json()) as ActionResult;
      return data;
    } catch {
      return { ok: false, error: "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجددًا." };
    }
  };
}
