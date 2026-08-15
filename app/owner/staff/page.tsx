'use client';

import { useState, useEffect } from 'react';
import { Clock, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth-store';
import {
  createReceptionLogin, getReceptionLogins, deactivateReceptionLogin, deleteReceptionLogin,
  createWaiterLogin, getWaiterLogins, deactivateWaiterLogin, deleteWaiterLogin,
} from '@/lib/actions/auth';
import { getStaff, deleteStaff } from '@/lib/actions/staff';
import { AddStaffDialog } from './_components/AddStaffDialog';
import { StaffDetailDialog } from './_components/StaffDetailDialog';
import { StaffDirectory } from './_components/StaffDirectory';
import { StaffLoginsSection } from './_components/StaffLoginsSection';
import type { StaffMember } from './_components/staff-shared';

export default function StaffPage() {
  const { restaurant } = useAuthStore();
  const restaurantId = restaurant?.id || '';

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    setIsLoading(true);
    getStaff().then((result) => {
      setIsLoading(false);
      setInitialized(true);
      if (result.error) { toast.error('Failed to load staff: ' + result.error); return; }
      if (result.data) {
        setStaffMembers(result.data.map((s: any) => {
          const role = s.role?.toUpperCase() || '';
          const firstName = s.firstName || '';
          const lastName = s.lastName || '';
          return {
            id:         s.id,
            name:       `${firstName} ${lastName}`.trim(),
            role,
            phone:      s.phoneNumber || '',
            email:      s.email || '',
            status:     s.status === 'ACTIVE' ? 'On Duty' : 'Off Duty',
            joinedDate: s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            salary:     s.salary || 0,
            // Initials from the two stored name columns. Reading both off
            // firstName gave every single-name staff member the same "ST"
            // placeholder, and the trailing space from the old concatenation
            // came back as an editable value in the edit form.
            avatar:     ((firstName[0] || 'S') + (lastName[0] || '')).toUpperCase(),
            avatarUrl:  s.profileImage || null,
            address:    s.address || undefined,
            dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth).toISOString().split('T')[0] : null,
            identityDocType: s.identityDocType || '',
            identityDocImage: s.identityDocImage || null,
            emergencyContactName: s.emergencyContactName || '',
            emergencyContactPhone: s.emergencyContactPhone || '',
            bloodGroup: s.bloodGroup || '',
          };
        }));
      }
    });
  }, [restaurantId]);

  const onDutyCount  = staffMembers.filter(s => s.status === 'On Duty').length;
  const waiterCount  = staffMembers.filter(s => s.role === 'WAITER').length;
  const kitchenCount = staffMembers.filter(s => s.role === 'KITCHEN').length;

  const filteredStaff = staffMembers.filter(staff => {
    const matchesSearch =
      staff.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      staff.phone.includes(searchQuery);
    const matchesRole =
      selectedRole === 'all' ||
      staff.role.toLowerCase() === selectedRole.toLowerCase();
    return matchesSearch && matchesRole;
  });

  const handleDelete = async (member: StaffMember) => {
    const res = await deleteStaff(String(member.id));
    if (res.error) { toast.error(res.error); return; }
    setStaffMembers((prev) => prev.filter((s) => s.id !== member.id));
    toast.success(`${member.name} deleted`);
  };

  // One updater for both edit entry points (the row pencil and the detail
  // dialog), so a save made from the profile view refreshes the row behind it
  // and the open dialog together.
  const handleUpdated = (updated: StaffMember) => {
    setStaffMembers((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    setSelectedStaff((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Management"
        description="Manage your restaurant staff and their roles"
      >
        <Badge variant="secondary" className="text-base px-3 py-1">
          {staffMembers.length} Staff Members
        </Badge>
        <AddStaffDialog
          restaurantId={restaurantId}
          onAdded={(member) => setStaffMembers((prev) => [member, ...prev])}
        />
      </PageHeader>

      {/*
        2x2 on a tablet, not 1x4. Four cards in the ~520px left after the
        248px sidebar reduces each one to an unreadable sliver.
      */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total Staff" value={staffMembers.length}>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </Kpi>
        <Kpi
          label="On Duty Today"
          value={onDutyCount}
          valueClass="text-primary"
          footnote={`${staffMembers.length > 0 ? Math.round((onDutyCount / staffMembers.length) * 100) : 0}% of total`}
        >
          <Clock className="h-4 w-4 text-success" />
        </Kpi>
        <Kpi label="Waiters" value={waiterCount} valueClass="text-primary">
          <div className="h-4 w-4 rounded-full bg-primary" />
        </Kpi>
        <Kpi label="Kitchen Staff" value={kitchenCount} valueClass="text-warning-strong">
          <div className="h-4 w-4 rounded-full bg-warning" />
        </Kpi>
      </div>

      <StaffDirectory
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedRole={selectedRole}
        onRoleChange={setSelectedRole}
        staff={filteredStaff}
        isReady={initialized && !isLoading}
        onSelect={setSelectedStaff}
        onUpdated={handleUpdated}
        onDeleted={handleDelete}
      />

      {selectedStaff && (
        <StaffDetailDialog
          staff={selectedStaff}
          open={!!selectedStaff}
          onOpenChange={(open) => { if (!open) setSelectedStaff(null); }}
          onUpdated={handleUpdated}
        />
      )}

      <StaffLoginsSection
        role="RECEPTIONIST"
        title="Reception Logins"
        description="Create and manage receptionist accounts"
        createFn={createReceptionLogin}
        listFn={getReceptionLogins}
        toggleFn={deactivateReceptionLogin}
        deleteFn={deleteReceptionLogin}
      />
      <StaffLoginsSection
        role="WAITER"
        title="Waiter Logins"
        description="Create and manage waiter accounts"
        createFn={createWaiterLogin}
        listFn={getWaiterLogins}
        toggleFn={deactivateWaiterLogin}
        deleteFn={deleteWaiterLogin}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  valueClass = '',
  footnote,
  children,
}: {
  label: string;
  value: number;
  valueClass?: string;
  footnote?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {children}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
        {footnote && <p className="text-xs text-muted-foreground mt-1">{footnote}</p>}
      </CardContent>
    </Card>
  );
}
