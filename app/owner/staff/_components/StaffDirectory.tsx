'use client';

import { useState } from 'react';
import { ChevronRight, Edit2, Search, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { EditStaffForm } from './EditStaffForm';
import { StaffAvatar, formatRole, roleColors, STAFF_ROLES, type StaffMember } from './staff-shared';

/**
 * The staff directory: toolbar, the table, and a card list for narrow screens.
 *
 * The table has seven columns and every cell was `whitespace-nowrap`, so on a
 * phone `components/ui/table.tsx` just handed it a horizontal scrollbar. Same
 * data, one extra branch: cards below `md`, table from `md` up. The toolbar
 * moved into the CardHeader so search and the role filter read as part of the
 * directory rather than as a floating row above it.
 */
export function StaffDirectory({
  searchQuery,
  onSearchChange,
  selectedRole,
  onRoleChange,
  staff,
  isReady,
  onSelect,
  onUpdated,
  onDeleted,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedRole: string;
  onRoleChange: (value: string) => void;
  staff: StaffMember[];
  isReady: boolean;
  onSelect: (member: StaffMember) => void;
  onUpdated: (member: StaffMember) => void;
  onDeleted: (member: StaffMember) => void;
}) {
  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle>Staff Directory</CardTitle>
          <CardDescription>Manage and view all staff members</CardDescription>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <Select value={selectedRole} onValueChange={onRoleChange}>
            <SelectTrigger className="sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {STAFF_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {!isReady ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground text-sm">Loading staff data...</p>
          </div>
        ) : staff.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">No staff members found</p>
        ) : (
          <>
            <ul className="space-y-2 md:hidden">
              {staff.map((member) => (
                <li key={member.id}>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => onSelect(member)}
                    >
                      <StaffAvatar
                        initials={member.avatar}
                        role={member.role}
                        imageUrl={member.avatarUrl}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{member.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{member.phone}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge className={roleColors[member.role]}>{formatRole(member.role)}</Badge>
                          <StatusDot status={member.status} />
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    </button>
                    <RowActions member={member} onUpdated={onUpdated} onDeleted={onDeleted} />
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[72px] whitespace-nowrap">Avatar</TableHead>
                    <TableHead className="w-[200px] whitespace-nowrap">Name</TableHead>
                    <TableHead className="w-[110px] whitespace-nowrap">Role</TableHead>
                    <TableHead className="w-[160px] whitespace-nowrap">Phone</TableHead>
                    <TableHead className="w-[110px] whitespace-nowrap">Status</TableHead>
                    <TableHead className="w-[120px] whitespace-nowrap">Joined</TableHead>
                    <TableHead className="whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => (
                    <TableRow
                      key={member.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onSelect(member)}
                    >
                      <TableCell className="whitespace-nowrap">
                        <StaffAvatar
                          initials={member.avatar}
                          role={member.role}
                          imageUrl={member.avatarUrl}
                        />
                      </TableCell>
                      <TableCell className="truncate whitespace-nowrap font-medium">{member.name}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className={roleColors[member.role]}>{formatRole(member.role)}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{member.phone}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusDot status={member.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(member.joinedDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <RowActions member={member} onUpdated={onUpdated} onDeleted={onDeleted} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <span
        className={`h-2 w-2 rounded-full ${status === 'On Duty' ? 'bg-primary' : 'bg-muted-foreground'}`}
      />
      {status}
    </span>
  );
}

/** Edit and Delete, shared by the table row and the card. */
function RowActions({
  member,
  onUpdated,
  onDeleted,
}: {
  member: StaffMember;
  onUpdated: (member: StaffMember) => void;
  onDeleted: (member: StaffMember) => void;
}) {
  // Controlled so a successful save closes the dialog. Uncontrolled, the form
  // saved and then sat there looking unsubmitted, which reads as "editing does
  // not work" even though the write went through.
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex flex-shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={`Edit ${member.name}`}>
            <Edit2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <EditStaffForm
            staff={member}
            onUpdated={(updated) => { onUpdated(updated); setEditOpen(false); }}
          />
        </DialogContent>
      </Dialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={`Delete ${member.name}`}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{member.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => onDeleted(member)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
