import { AuthShell } from "@/components/auth/auth-shell";
import { AcceptInviteForm } from "@/components/auth/forms";
import { hashToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";

export const metadata = { title: "قبول الدعوة" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await db.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { tenant: true } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
    return <AuthShell title="الدعوة غير صالحة" subtitle="انتهت صلاحية الرابط أو تم استخدامه. اطلب دعوة جديدة من مدير المنشأة."><span /></AuthShell>;
  }
  return (
    <AuthShell title={`انضم إلى ${inv.tenant.name}`} subtitle={`تمت دعوتك بدور: ${ROLE_LABELS[inv.role]}`}>
      <AcceptInviteForm token={token} email={inv.email} />
    </AuthShell>
  );
}
