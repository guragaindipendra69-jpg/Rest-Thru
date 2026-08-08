'use client';

import { useState } from 'react';
import { ChevronDown, Plus, Upload } from 'lucide-react';
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
import { uploadImage } from '@/lib/upload';
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
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docPreview, setDocPreview] = useState<string | null>(null);

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setAvatarFile(null);
    setAvatarPreview(null);
    setDocFile(null);
    setDocPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) { toast.error('Restaurant not found'); return; }

    setIsLoading(true);
    try {
      let avatar_url: string | null = null;
      if (avatarFile) {
        avatar_url = await uploadImage(avatarFile, 'avatars');
        if (!avatar_url) toast.error('Avatar upload failed — continuing without photo');
      }

      let docImageUrl: string | null = null;
      if (docFile) {
        docImageUrl = await uploadImage(docFile, 'identity-docs');
        if (!docImageUrl) toast.error('Document upload failed');
      }

      const result = await addStaff({
        name: formData.fullName,
        role: formData.role,
        phone: formData.phone,
        email: formData.email || undefined,
        avatarUrl: avatar_url,
        address: formData.address || undefined,
        dateOfBirth: formData.dateOfBirth || null,
        identityDocType: formData.identityDocType,
        identityDocImage: docImageUrl || formData.identityDocImage,
        emergencyContactName: formData.emergencyContactName,
        emergencyContactPhone: formData.emergencyContactPhone,
        bloodGroup: formData.bloodGroup,
      });

      if ('limitReached' in result && result.limitReached) { showUpgrade(result.limitReached); return; }
      if (result.error) { toast.error(result.error || 'Failed to add staff'); return; }

      const initials = formData.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
      onAdded({
        id: Date.now(),
        name: formData.fullName,
        role: formData.role.toUpperCase(),
        phone: formData.phone,
        email: formData.email || '',
        status: 'Off Duty',
        joinedDate: new Date().toISOString().split('T')[0],
        salary: 0,
        avatar: initials,
        avatarUrl: avatar_url,
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
              <Field label="Date of Birth">
                <Input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                />
              </Field>
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
              <div>
                <label className="block text-sm font-medium mb-2">Upload Document Photo</label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-border-control rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition">
                  {docPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={docPreview} alt="Document preview" className="h-24 object-cover rounded mb-2" />
                  ) : (
                    <div className="text-center">
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground">PNG, JPG up to 10MB</p>
                    </div>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { setDocFile(file); setDocPreview(URL.createObjectURL(file)); }
                    }}
                  />
                </label>
              </div>
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
          <div>
            <label className="block text-sm font-medium mb-2">Profile Photo (Optional)</label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border-control rounded-lg p-6 cursor-pointer hover:bg-muted/50 transition">
              {avatarPreview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="h-20 w-20 rounded-full object-cover mb-2"
                  />
                  <p className="text-xs text-muted-foreground">Click to change</p>
                </>
              ) : (
                <div className="text-center">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Click to upload</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</p>
                </div>
              )}
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setAvatarFile(file);
                    setAvatarPreview(URL.createObjectURL(file));
                  }
                }}
              />
            </label>
          </div>
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
