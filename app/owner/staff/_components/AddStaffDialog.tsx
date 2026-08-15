'use client';

import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addStaff } from '@/lib/actions/staff';
import { UploadField } from '@/components/shared/upload-field';
import { useUpgradeStore } from '@/store/upgrade-store';
import { toast } from 'sonner';
import { STAFF_ROLES, type StaffMember } from './staff-shared';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const DOC_TYPES = [
  { value: 'citizenship', label: 'Citizenship' },
  { value: 'driving_license', label: 'Driving License' },
  { value: 'passport', label: 'Passport' },
  { value: 'national_id', label: 'National ID' },
  { value: 'voter_id', label: 'Voter ID' },
];

// Roles whose staff sign in to a console. Other roles are directory-only, so
// the dialog does not point them at a Logins section that cannot serve them.
const LOGIN_CAPABLE_ROLES: Record<string, string> = {
  waiter: 'Waiter Logins',
  receptionist: 'Reception Logins',
};

const EMPTY_FORM = {
  fullName: '',
  role: '',
  phone: '',
  email: '',
  address: '',
  dateOfBirth: '',
  identityDocType: '',
  identityDocImage: null as string | null,
  emergencyContactName: '',
  emergencyContactPhone: '',
  bloodGroup: '',
  avatarUrl: null as string | null,
  salary: '',
};

/**
 * Add Staff. The four required fields stay above the fold; everything the IRD
 * and HR records want lives behind the Additional Information disclosure.
 */
export function AddStaffDialog({
  restaurantId,
  onAdded,
}: {
  restaurantId: string;
  onAdded: (member: StaffMember) => void;
}) {
  const showUpgrade = useUpgradeStore((s) => s.show);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const resetForm = () => setFormData(EMPTY_FORM);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) { toast.error('Restaurant not found'); return; }

    const salary = formData.salary.trim() === '' ? 0 : Number(formData.salary);
    if (!Number.isFinite(salary) || salary < 0) {
      toast.error('Salary must be a positive number');
      return;
    }

    setIsLoading(true);
    try {
      // Both files are already uploaded — UploadField stores on pick and hands
      // back a URL, so submit no longer has to sequence two uploads and decide
      // what to do when the second one fails after the first succeeded.
      const result = await addStaff({
        name: formData.fullName,
        role: formData.role,
        phone: formData.phone,
        email: formData.email || undefined,
        avatarUrl: formData.avatarUrl,
        address: formData.address || undefined,
        dateOfBirth: formData.dateOfBirth || null,
        identityDocType: formData.identityDocType,
        identityDocImage: formData.identityDocImage,
        emergencyContactName: formData.emergencyContactName,
        emergencyContactPhone: formData.emergencyContactPhone,
        bloodGroup: formData.bloodGroup,
        salary,
      });

      if ('limitReached' in result && result.limitReached) { showUpgrade(result.limitReached); return; }
      if (result.error) { toast.error(result.error || 'Failed to add staff'); return; }

      // First initial plus the last word's, matching how the action splits the
      // name into firstName / lastName and how app/owner/staff/page.tsx rebuilds
      // the badge on reload. Taking the first two words instead made the row
      // change its initials the moment the page was refreshed.
      const words = formData.fullName.trim().split(/\s+/);
      const initials = ((words[0]?.[0] || 'S') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
      onAdded({
        id: ('data' in result && result.data?.id) ? result.data.id : Date.now(),
        name: formData.fullName,
        role: formData.role.toUpperCase(),
        phone: formData.phone,
        email: formData.email || '',
        status: 'Off Duty',
        joinedDate: new Date().toISOString().split('T')[0],
        salary,
        avatar: initials,
        avatarUrl: formData.avatarUrl,
        address: formData.address,
        dateOfBirth: formData.dateOfBirth || null,
        identityDocType: formData.identityDocType,
        identityDocImage: formData.identityDocImage,
        emergencyContactName: formData.emergencyContactName,
        emergencyContactPhone: formData.emergencyContactPhone,
        bloodGroup: formData.bloodGroup,
      });

      toast.success(`${formData.fullName} added successfully`);
      setIsOpen(false);
      resetForm();
    } catch (err) {
      console.error('Add staff error:', err);
      toast.error(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const loginSection = LOGIN_CAPABLE_ROLES[formData.role];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary-hover">
          <Plus className="h-4 w-4 mr-2" />
          Add Staff
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Staff Member</DialogTitle>
          <DialogDescription>
            Fill in the details to add a new staff member to your restaurant.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Field label="Full Name *">
            <Input
              placeholder="Enter full name"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              required
            />
          </Field>
          <Field label="Role *">
            <Select
              value={formData.role}
              onValueChange={(value) => setFormData({ ...formData, role: value })}
            >
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Phone Number *">
            <Input
              placeholder="98XXXXXXXX (Nepal mobile)"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
          </Field>
          <Field label="Email (Optional)">
            <Input
              type="email"
              placeholder="email@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </Field>
          <details className="group">
            <summary className="text-sm font-semibold text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-2 py-1">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              Additional Information
            </summary>
            <div className="mt-3 space-y-4">
              <Field label="Address">
                <Input
                  placeholder="Street, city"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date of Birth">
                  <Input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  />
                </Field>
                <Field label="Monthly Salary">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={formData.salary}
                    onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Identity Document Type">
                <Select
                  value={formData.identityDocType}
                  onValueChange={(value) => setFormData({ ...formData, identityDocType: value })}
                >
                  <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Identity Document">
                <UploadField
                  value={formData.identityDocImage}
                  onChange={(url) => setFormData((prev) => ({ ...prev, identityDocImage: url }))}
                  folder="identity-docs"
                  kind="document"
                  disabled={isLoading}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Emergency Contact Name">
                  <Input
                    placeholder="Full name"
                    value={formData.emergencyContactName}
                    onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                  />
                </Field>
                <Field label="Emergency Contact Phone">
                  <Input
                    placeholder="98XXXXXXXX (Nepal mobile)"
                    value={formData.emergencyContactPhone}
                    onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Blood Group">
                <Select
                  value={formData.bloodGroup}
                  onValueChange={(value) => setFormData({ ...formData, bloodGroup: value })}
                >
                  <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
                  <SelectContent>
                    {BLOOD_GROUPS.map((bg) => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </details>

          {loginSection && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-muted-foreground">
              After adding, create a login for this {formData.role} in the{' '}
              <strong>{loginSection}</strong> section below so they can sign in.
            </div>
          )}
          <Field label="Profile Photo (Optional)">
            <UploadField
              value={formData.avatarUrl}
              onChange={(url) => setFormData((prev) => ({ ...prev, avatarUrl: url }))}
              folder="avatars"
              shape="circle"
              disabled={isLoading}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setIsOpen(false); resetForm(); }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-primary" disabled={isLoading}>
              {isLoading ? 'Adding...' : 'Add Staff'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
