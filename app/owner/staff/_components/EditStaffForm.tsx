'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UploadField } from '@/components/shared/upload-field';
import { updateStaff } from '@/lib/actions/staff';
import { toast } from 'sonner';
import { STAFF_ROLES, type StaffMember } from './staff-shared';

const BLOOD_GROUPS = ['none', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const DOC_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'citizenship', label: 'Citizenship' },
  { value: 'driving_license', label: 'Driving License' },
  { value: 'passport', label: 'Passport' },
  { value: 'national_id', label: 'National ID' },
  { value: 'voter_id', label: 'Voter ID' },
];

/**
 * Edit form for one staff member, rendered inside a Dialog.
 *
 * Every field the record carries is editable here. It previously covered only
 * the text fields: the profile photo and the identity document had no picker at
 * all, so a photo could be set once at Add time and never corrected, and salary
 * and duty status were display-only in the detail dialog with nowhere to change
 * them.
 *
 * `none` is a sentinel for the two optional Selects: Radix will not accept an
 * empty string as an item value, so it is mapped back to `''` on save.
 */
export function EditStaffForm({
  staff,
  onUpdated,
}: {
  staff: StaffMember;
  onUpdated: (updated: StaffMember) => void;
}) {
  const [form, setForm] = useState({
    name: staff.name.trim(),
    role: staff.role.toLowerCase(),
    phone: staff.phone,
    email: staff.email,
    address: staff.address || '',
    dateOfBirth: staff.dateOfBirth || '',
    identityDocType: staff.identityDocType || 'none',
    identityDocImage: staff.identityDocImage || null,
    emergencyContactName: staff.emergencyContactName || '',
    emergencyContactPhone: staff.emergencyContactPhone || '',
    bloodGroup: staff.bloodGroup || 'none',
    avatarUrl: staff.avatarUrl || null,
    salary: staff.salary ? String(staff.salary) : '',
    status: staff.status === 'On Duty' ? 'ACTIVE' : 'INACTIVE',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim() || !form.role || !form.phone.trim()) {
      toast.error('Name, role, and phone are required');
      return;
    }
    // Guard the parse rather than letting NaN reach the action: Prisma rejects
    // NaN on a Float column with an opaque validation error.
    const salary = form.salary.trim() === '' ? 0 : Number(form.salary);
    if (!Number.isFinite(salary) || salary < 0) {
      toast.error('Salary must be a positive number');
      return;
    }

    setSaving(true);
    const docType = form.identityDocType === 'none' ? '' : form.identityDocType;
    const bGroup = form.bloodGroup === 'none' ? '' : form.bloodGroup;
    const res = await updateStaff({
      id: String(staff.id),
      name: form.name.trim(),
      role: form.role,
      phone: form.phone.trim(),
      email: form.email,
      address: form.address,
      dateOfBirth: form.dateOfBirth || null,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
      identityDocType: docType,
      identityDocImage: form.identityDocImage,
      bloodGroup: bGroup,
      avatarUrl: form.avatarUrl,
      salary,
      status: form.status,
    });
    setSaving(false);
    if ('error' in res && res.error) { toast.error(res.error); return; }
    toast.success('Staff updated');

    const parts = form.name.trim().split(/\s+/);
    const initials = ((parts[0]?.[0] || 'S') + (parts[1]?.[0] || '')).toUpperCase();
    onUpdated({
      ...staff,
      name: form.name.trim(),
      role: form.role.toUpperCase(),
      phone: form.phone.trim(),
      email: form.email,
      address: form.address,
      dateOfBirth: form.dateOfBirth || null,
      identityDocType: docType,
      identityDocImage: form.identityDocImage,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
      bloodGroup: bGroup,
      avatarUrl: form.avatarUrl,
      avatar: initials,
      salary,
      status: form.status === 'ACTIVE' ? 'On Duty' : 'Off Duty',
    });
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Edit Staff Member</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        <Field label="Profile Photo">
          <UploadField
            value={form.avatarUrl}
            onChange={(url) => setForm((prev) => ({ ...prev, avatarUrl: url }))}
            folder="avatars"
            shape="circle"
            disabled={saving}
          />
        </Field>
        <Field label="Full Name *">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Role *">
          <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAFF_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone *">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Duty Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">On Duty</SelectItem>
                <SelectItem value="INACTIVE">Off Duty</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Email">
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Address">
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of Birth">
            <Input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
            />
          </Field>
          <Field label="Monthly Salary">
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={form.salary}
              onChange={(e) => setForm({ ...form, salary: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Identity Document Type">
          <Select
            value={form.identityDocType}
            onValueChange={(v) => setForm({ ...form, identityDocType: v })}
          >
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Identity Document">
          <UploadField
            value={form.identityDocImage}
            onChange={(url) => setForm((prev) => ({ ...prev, identityDocImage: url }))}
            folder="identity-docs"
            kind="document"
            disabled={saving}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Emergency Contact Name">
            <Input
              value={form.emergencyContactName}
              onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
            />
          </Field>
          <Field label="Emergency Phone">
            <Input
              value={form.emergencyContactPhone}
              onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Blood Group">
          <Select value={form.bloodGroup} onValueChange={(v) => setForm({ ...form, bloodGroup: v })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {BLOOD_GROUPS.map((bg) => (
                <SelectItem key={bg} value={bg}>{bg === 'none' ? 'None' : bg}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <DialogFooter>
        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
        <Button disabled={saving} onClick={handleSave}>{saving ? 'Saving...' : 'Save'}</Button>
      </DialogFooter>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}
