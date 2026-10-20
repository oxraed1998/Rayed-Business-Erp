"use client";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/fields";
import { updateMemberAction } from "@/server/actions/users";
import type { Option } from "@/server/queries/options";

export interface PermGroup { resource: string; label: string; perms: { value: string; label: string }[] }

export function EditMemberDialog({ member, roles, companies, groups, roleDefaults }: {
  member: { id: string; name: string; role: string; companyIds: string[]; grants: string[]; denials: string[] };
  roles: Option[]; companies: Option[]; groups: PermGroup[]; roleDefaults: string[];
}) {
  return (
    <FormDialog title={`صلاحيات ${member.name}`} description="الصلاحيات الإضافية تُضاف لصلاحيات الدور، والمحظورة تُسحب منها" trigger="تعديل" triggerVariant="outline" triggerSize="sm" icon={false} action={updateMemberAction} wide>
      <input type="hidden" name="membershipId" value={member.id} />
      <SelectField name="role" label="الدور" options={roles} defaultValue={member.role} required />
      <div className="rounded-xl border p-4">
        <p className="mb-1 text-sm font-bold">الشركات المسموح بها</p>
        <p className="mb-3 text-xs text-muted-foreground">بدون تحديد = جميع شركات المنشأة</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {companies.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="companyIds" value={c.value} defaultChecked={member.companyIds.includes(c.value)} className="size-4 accent-[hsl(var(--gold))]" />{c.label}
            </label>
          ))}
        </div>
      </div>
      <div className="rounded-xl border p-4">
        <p className="mb-1 text-sm font-bold">تخصيص الصلاحيات</p>
        <p className="mb-3 text-xs text-muted-foreground">• = ضمن صلاحيات الدور الحالي ({member.role})</p>
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.resource} className="grid grid-cols-[110px_1fr] gap-2 border-b pb-2 text-xs last:border-0">
              <span className="font-bold">{g.label}</span>
              <div className="space-y-1">
                {g.perms.map((p) => (
                  <div key={p.value} className="flex flex-wrap items-center gap-3">
                    <span className="w-20">{p.label}{roleDefaults.includes(p.value) && <span className="text-gold"> •</span>}</span>
                    <label className="flex items-center gap-1"><input type="checkbox" name="grants" value={p.value} defaultChecked={member.grants.includes(p.value)} className="accent-[hsl(var(--success))]" />منح</label>
                    <label className="flex items-center gap-1"><input type="checkbox" name="denials" value={p.value} defaultChecked={member.denials.includes(p.value)} className="accent-[hsl(var(--destructive))]" />حظر</label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </FormDialog>
  );
}
