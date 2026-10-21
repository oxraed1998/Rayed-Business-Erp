import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SetupForm } from "@/components/auth/forms";
import { db } from "@/lib/db";

export const metadata = { title: "الإعداد الأولي" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  const enabled = (process.env.SETUP_TOKEN ?? "").length >= 16;
  return (
    <AuthShell title="إعداد المنصة" subtitle="أنشئ حساب مالك المنصة (Super Admin) والمنشأة الأولى">
      {enabled ? <SetupForm /> : (
        <div className="rounded-xl border border-dashed p-5 text-sm leading-relaxed text-muted-foreground">
          الإعداد الأولي معطل لحماية المنصة. اضبط متغير البيئة <code dir="ltr" className="rounded bg-muted px-1">SETUP_TOKEN</code> (16 حرفًا على الأقل) على الخادم ثم أعد تحميل الصفحة.
        </div>
      )}
    </AuthShell>
  );
}
