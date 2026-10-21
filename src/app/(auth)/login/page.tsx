import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata = { title: "تسجيل الدخول" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/");
  const { next } = await searchParams;
  const noUsers = (await db.user.count()) === 0;
  return (
    <AuthShell title="مرحبًا بعودتك" subtitle="سجّل دخولك للوصول إلى لوحة إدارة أعمالك">
      {noUsers && (
        <div className="mb-6 rounded-xl border border-gold/40 bg-gold-soft p-4 text-sm">
          لم يتم إعداد المنصة بعد. <Link href="/setup" className="font-bold underline">ابدأ الإعداد الأولي</Link>
        </div>
      )}
      <LoginForm next={next} />
    </AuthShell>
  );
}
