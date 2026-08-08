'use client';

/**
 * Types and tokens shared by the staff directory, its row actions and its
 * dialogs. Lifted out of `page.tsx` so the table and the small-screen card
 * list can render the same badge colours and the same avatar without either
 * importing the page.
 */

export interface StaffMember {
  id: number | string;
  name: string;
  role: string;
  phone: string;
  email: string;
  status: string;
  joinedDate: string;
  salary: number;
  avatar: string;
  avatarUrl?: string | null;
  address?: string;
  dateOfBirth?: string | null;
  identityDocType?: string;
  identityDocImage?: string | null;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bloodGroup?: string;
}

export const roleColors: { [key: string]: string } = {
  WAITER: 'bg-primary-light text-primary',
  KITCHEN: 'bg-warning-surface text-warning-strong',
  CASHIER: 'bg-primary-light text-primary',
  MANAGER: 'bg-primary-light text-primary',
  RECEPTIONIST: 'bg-primary-light text-primary',
  BARTENDER: 'bg-primary-light text-primary',
  CHEF: 'bg-warning-surface text-warning-strong',
  COOK: 'bg-warning-surface text-warning-strong',
  BUSSER: 'bg-primary-light text-primary',
  HOUSEKEEPER: 'bg-primary-light text-primary',
};

export const avatarBgColors: { [key: string]: string } = {
  WAITER: 'bg-primary',
  KITCHEN: 'bg-warning',
  CASHIER: 'bg-primary',
  MANAGER: 'bg-primary',
  RECEPTIONIST: 'bg-primary',
  BARTENDER: 'bg-primary',
  CHEF: 'bg-warning',
  COOK: 'bg-warning',
  BUSSER: 'bg-primary',
  HOUSEKEEPER: 'bg-primary',
};

/** Roles offered by Add Staff and the directory filter, in the same order. */
export const STAFF_ROLES = [
  { value: 'waiter', label: 'Waiter' },
  { value: 'bartender', label: 'Bartender' },
  { value: 'chef', label: 'Chef' },
  { value: 'cook', label: 'Cook' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'busser', label: 'Busser' },
  { value: 'housekeeper', label: 'Housekeeper' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'manager', label: 'Manager' },
];

export function StaffAvatar({
  initials,
  role,
  imageUrl,
  size = 'h-10 w-10',
  textSize = 'text-sm',
}: {
  initials: string;
  role: string;
  imageUrl?: string | null;
  size?: string;
  textSize?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={initials}
        className={`${size} rounded-full object-cover`}
      />
    );
  }
  return (
    <div
      className={`${avatarBgColors[role] || 'bg-muted'} ${size} ${textSize} rounded-full flex items-center justify-center text-white font-semibold`}
    >
      {initials}
    </div>
  );
}

export function formatRole(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}
