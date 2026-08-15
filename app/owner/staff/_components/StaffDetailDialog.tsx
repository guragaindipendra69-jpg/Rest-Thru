'use client';

import { useState } from 'react';
import { Eye, EyeOff, Pencil, QrCode } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/format';
import { isPdf } from '@/lib/upload-limits';
import { EditStaffForm } from './EditStaffForm';
import { StaffAvatar, formatRole, roleColors, type StaffMember } from './staff-shared';

/**
 * Profile for one staff member. Salary stays masked until asked for.
 *
 * `onUpdated` turns the Edit button on. It is optional so a caller that only
 * wants the read-only view can leave it off rather than pass a no-op.
 */
export function StaffDetailDialog({
  staff,
  open,
  onOpenChange,
  onUpdated,
}: {
  staff: StaffMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (member: StaffMember) => void;
}) {
  const [showSalary, setShowSalary] = useState(false);
  // Swaps this dialog's body for the edit form. Opening a row went straight to
  // a read-only profile with no way through to editing, so the only edit
  // affordance was the pencil in the row actions, which is easy to miss.
  const [editing, setEditing] = useState(false);

  if (editing && onUpdated) {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => { if (!next) setEditing(false); onOpenChange(next); }}
      >
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <EditStaffForm
            staff={staff}
            onUpdated={(updated) => { onUpdated(updated); setEditing(false); }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Staff Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex flex-col items-center gap-3">
            <StaffAvatar
              initials={staff.avatar}
              role={staff.role}
              imageUrl={staff.avatarUrl}
              size="h-20 w-20"
              textSize="text-2xl"
            />
            {onUpdated && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit Profile
              </Button>
            )}
          </div>
          <div className="space-y-3">
            <Row label="Name">
              <p className="font-medium">{staff.name}</p>
            </Row>
            <Row label="Role">
              <Badge className={roleColors[staff.role]}>{formatRole(staff.role)}</Badge>
            </Row>
            <Row label="Phone">
              <p className="font-medium">{staff.phone}</p>
            </Row>
            <Row label="Email">
              <p className="font-medium">{staff.email}</p>
            </Row>
            {staff.address && (
              <Row label="Address">
                <p className="font-medium">{staff.address}</p>
              </Row>
            )}
            {staff.dateOfBirth && (
              <Row label="Date of Birth">
                <p className="font-medium">{staff.dateOfBirth}</p>
              </Row>
            )}
            {staff.emergencyContactName && (
              <Row label="Emergency Contact">
                <p className="font-medium">
                  {staff.emergencyContactName}
                  {staff.emergencyContactPhone ? ` - ${staff.emergencyContactPhone}` : ''}
                </p>
              </Row>
            )}
            {staff.bloodGroup && (
              <Row label="Blood Group">
                <p className="font-medium">{staff.bloodGroup}</p>
              </Row>
            )}
            {staff.identityDocType && (
              <Row label="Identity Document">
                <div className="flex items-center gap-2">
                  <p className="font-medium capitalize">{staff.identityDocType.replace(/_/g, ' ')}</p>
                  {staff.identityDocImage && (
                    <a
                      href={staff.identityDocImage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-xs hover:underline"
                    >
                      {isPdf(staff.identityDocImage) ? 'Open PDF' : 'View Photo'}
                    </a>
                  )}
                </div>
              </Row>
            )}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">Monthly Salary</p>
                <Button size="sm" variant="ghost" onClick={() => setShowSalary(!showSalary)}>
                  {showSalary ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </div>
              {showSalary && <p className="font-medium text-lg">{formatCurrency(staff.salary)}</p>}
            </div>
            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Today&apos;s Activity</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">On Duty Since:</span>
                  <span className="font-medium">9:00 AM</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Orders Handled:</span>
                  <span className="font-medium">23</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Revenue Generated:</span>
                  <span className="font-medium">{formatCurrency(15400)}</span>
                </div>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-3">QR Badge</p>
              <Button className="w-full" variant="outline">
                <QrCode className="h-4 w-4 mr-2" />
                Generate QR Badge
              </Button>
              <div className="mt-3 p-4 border rounded-lg bg-muted flex items-center justify-center h-24">
                <div className="text-center">
                  <QrCode className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">QR Badge Preview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
