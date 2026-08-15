'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Loader2, Trash2, Upload } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { uploadFile } from '@/lib/upload';
import { IMAGE_ACCEPT, validateUpload } from '@/lib/upload-limits';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth-store';
import {
  getRestaurant, updateRestaurant, updateCoverPhoto, saveOperatingHours,
  getRestaurantDeleteInfo, deleteMyRestaurant,
} from '@/lib/actions/settings';
// Password changes go through the auth action, which resolves the account from
// the session cookie rather than an id sent by this page.
import { changePassword } from '@/lib/actions/auth';

interface RestaurantData {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  cover_url: string;
  operating_hours: Record<string, { open: string; close: string; enabled: boolean }>;
  language: string;
  currency: string;
  timezone: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Maps a weekday name to the `operating_hours.day_of_week` index (0=Sun … 6=Sat)
// used by the DB table and the public menu book.
const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};
const DEFAULT_HOURS = Object.fromEntries(
  DAYS.map((day) => [day, { open: '07:00', close: '22:00', enabled: true }])
);

// What the danger zone needs to decide whether it can offer the delete at all.
// Null while loading, and stays null for anyone the action refuses (a legacy
// STAFF login in this portal), which is what hides the card.
interface DeleteInfo {
  restaurantName: string;
  billCount: number;
  confirmationPhrase: string;
}

const normalizePhrase = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Settings index -- Restaurant Details, Operating Hours, and account security.
 *
 * This page used to be a 1215-line tab set nested inside SettingsShell's own
 * sidebar, so two navigations competed for the same screen. Worse, four of its
 * eight TabsContent blocks (printers, notifications, subscription, support) had
 * no matching trigger and could not be opened at all, yet still cost a
 * getOwnerTickets / getAvailablePlans / getActiveSubscription round trip on
 * every visit. Each of those already had a real route in the shell nav
 * (`/settings/{printer,notifications,billing,support}`), and Payments moved to
 * Integrations, which now owns gateway credentials. What remains is what only
 * lives here.
 */
export default function SettingsPage() {
  const { restaurant: authRestaurant } = useAuthStore();
  const restaurantId = authRestaurant?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPwd, setIsSavingPwd] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const [deleteInfo, setDeleteInfo] = useState<DeleteInfo | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [restaurant, setRestaurant] = useState<RestaurantData>({
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    cover_url: '',
    operating_hours: DEFAULT_HOURS,
    language: 'en',
    currency: 'NPR',
    timezone: 'Asia/Kathmandu',
  });

  const loadData = useCallback(async () => {
    if (!restaurantId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [restRes, deleteRes] = await Promise.all([
        getRestaurant(restaurantId),
        getRestaurantDeleteInfo(),
      ]);

      // An error here just means this account may not delete the outlet, so the
      // danger zone stays hidden rather than showing a disabled control.
      setDeleteInfo('data' in deleteRes && deleteRes.data ? deleteRes.data : null);

      if (restRes.data) {
        const r = restRes.data as any;
        // operatingHours comes from the relational table as rows keyed by
        // day_of_week (0=Sun … 6=Sat); fold it back into the day-name map the UI uses.
        const rows: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }> =
          Array.isArray(r.operatingHours) ? r.operatingHours : [];
        const byIndex = new Map(rows.map((h) => [h.dayOfWeek, h]));
        const hours = Object.fromEntries(
          DAYS.map((day) => {
            const rec = byIndex.get(DAY_INDEX[day]);
            return [
              day,
              rec
                ? { open: rec.openTime, close: rec.closeTime, enabled: rec.isOpen }
                : { open: '07:00', close: '22:00', enabled: true },
            ];
          })
        );
        setRestaurant({
          name: r.name ?? '',
          address: r.street ?? '',
          phone: r.phoneNumber ?? '',
          email: r.email ?? '',
          website: r.websiteUrl ?? '',
          cover_url: r.bannerImageUrl ?? '',
          operating_hours: hours,
          language: r.language ?? 'en',
          currency: r.currency ?? 'NPR',
          timezone: r.timezone ?? 'Asia/Kathmandu',
        });
        if (r.bannerImageUrl) setCoverPreview(r.bannerImageUrl);
      }
    } catch (error) {
      console.error('Settings load:', error);
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveGeneral = async () => {
    if (!restaurantId) return;
    setIsSaving(true);
    const hoursPayload = DAYS.map((day) => ({
      dayOfWeek: DAY_INDEX[day],
      isOpen: restaurant.operating_hours[day]?.enabled ?? true,
      openTime: restaurant.operating_hours[day]?.open ?? '07:00',
      closeTime: restaurant.operating_hours[day]?.close ?? '22:00',
    }));
    const [result, hoursResult] = await Promise.all([
      updateRestaurant(restaurantId, {
        name: restaurant.name,
        street: restaurant.address,
        phoneNumber: restaurant.phone,
        email: restaurant.email,
        websiteUrl: restaurant.website,
        currency: restaurant.currency,
        timezone: restaurant.timezone,
      }),
      saveOperatingHours(restaurantId, hoursPayload),
    ]);
    setIsSaving(false);
    if (result.error) { toast.error(result.error); return; }
    if (hoursResult.error) { toast.error(hoursResult.error); return; }
    toast.success('Settings saved');
  };

  // The action takes no user id: it changes the password of whoever the session
  // cookie says is calling. These checks are for the fast error message only —
  // length and the current password are enforced again server side.
  const submitPasswordChange = async () => {
    if (!currentPwd) {
      toast.error('Enter your current password');
      return;
    }
    if (newPwd.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error('Passwords do not match');
      return;
    }
    setIsSavingPwd(true);
    const result = await changePassword(currentPwd, newPwd);
    setIsSavingPwd(false);
    if ('error' in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Password updated');
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
  };

  const handleCoverUpload = async (file: File) => {
    setIsUploadingCover(true);
    // Reports why rather than a flat "Cover upload failed", and puts the stored
    // cover back on screen if the new one did not land — the optimistic preview
    // is set before the upload, so a rejected file used to stay visible as
    // though it had saved.
    const res = await uploadFile(file, 'covers', 'image');
    if ('error' in res) {
      toast.error(res.error);
      setCoverPreview(restaurant.cover_url || null);
      setIsUploadingCover(false);
      return;
    }
    const result = await updateCoverPhoto(restaurantId!, res.url);
    if (result.error) {
      toast.error(result.error || 'Cover upload failed');
      setCoverPreview(restaurant.cover_url || null);
    } else {
      setRestaurant((prev) => ({ ...prev, cover_url: res.url }));
      toast.success('Cover uploaded');
    }
    setIsUploadingCover(false);
  };

  const deletePhraseMatches =
    !!deleteInfo && normalizePhrase(deleteConfirm) === deleteInfo.confirmationPhrase;

  const handleDeleteRestaurant = async () => {
    if (!deletePhraseMatches) return;
    setIsDeleting(true);
    const result = await deleteMyRestaurant(deleteConfirm);
    if ('error' in result && result.error) {
      setIsDeleting(false);
      toast.error(result.error);
      return;
    }
    toast.success('Restaurant deleted');
    // Full navigation rather than router.push: the session cookies are gone and
    // the in-memory auth store still holds the deleted restaurant, so the app
    // needs to boot from scratch (same approach as logout in store/auth-store).
    window.location.href = '/';
  };

  const setHours = (day: string, field: 'open' | 'close' | 'enabled', value: string | boolean) => {
    setRestaurant((prev) => ({
      ...prev,
      operating_hours: { ...prev.operating_hours, [day]: { ...prev.operating_hours[day], [field]: value } },
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="mb-2 h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Restaurant Details"
        description="Your outlet's identity, contact details and trading hours"
      />

      <Card>
        <CardHeader>
          <CardTitle>Restaurant Information</CardTitle>
          <CardDescription>Update your restaurant details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Restaurant Name</Label>
            <Input
              value={restaurant.name}
              onChange={(event) => setRestaurant((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Enter restaurant name"
            />
          </div>

          <div className="space-y-2">
            <Label>Cover Photo</Label>
            <label className="block w-full cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-primary">
              {coverPreview ? (
                <div className="relative">
                  <img src={coverPreview} alt="Cover" className="h-40 w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity hover:opacity-100">
                    <p className="text-sm font-medium text-white">Click to change</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 bg-muted/50 p-8">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{isUploadingCover ? 'Uploading…' : 'Recommended: 1200×400px'}</p>
                </div>
              )}
              <input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                const check = validateUpload(file, 'image');
                if (!check.ok) { toast.error(check.error); return; }
                setCoverPreview(URL.createObjectURL(file));
                handleCoverUpload(file);
              }} />
            </label>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={restaurant.address} onChange={(event) => setRestaurant((prev) => ({ ...prev, address: event.target.value }))} placeholder="Street address" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={restaurant.phone} onChange={(event) => setRestaurant((prev) => ({ ...prev, phone: event.target.value }))} placeholder="98XXXXXXXX (Nepal mobile)" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={restaurant.email} onChange={(event) => setRestaurant((prev) => ({ ...prev, email: event.target.value }))} placeholder="restaurant@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input type="url" value={restaurant.website} onChange={(event) => setRestaurant((prev) => ({ ...prev, website: event.target.value }))} placeholder="https://your-restaurant.com" />
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Language</Label>
              <div className="flex gap-4">
                {[{ value: 'en', label: 'English' }, { value: 'ne', label: 'Nepali' }].map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="language" checked={restaurant.language === option.value} onChange={() => setRestaurant((prev) => ({ ...prev, language: option.value }))} />
                    <span className="text-sm">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input value={restaurant.timezone} onChange={(event) => setRestaurant((prev) => ({ ...prev, timezone: event.target.value }))} placeholder="Asia/Kathmandu" />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={restaurant.currency} onChange={(event) => setRestaurant((prev) => ({ ...prev, currency: event.target.value }))} placeholder="NPR" />
              <p className="text-xs text-muted-foreground">Contact support to change your billing currency.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operating Hours</CardTitle>
          <CardDescription>Shown on your digital menu and used to flag out-of-hours orders</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAYS.map((day) => {
            const open = restaurant.operating_hours[day]?.enabled ?? true;
            return (
              // Stacks on a phone: the two time inputs plus a switch do not fit
              // on one line under 640px without the fields shrinking to unusable.
              <div key={day} className="flex flex-col gap-2 border-b pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex items-center justify-between gap-4 sm:w-32">
                  <p className="text-sm font-medium">{day}</p>
                  <Switch className="sm:hidden" checked={open} onCheckedChange={(value) => setHours(day, 'enabled', value)} />
                </div>
                <div className="flex flex-1 items-center gap-2">
                  <Input type="time" className="w-full sm:w-32" disabled={!open} value={restaurant.operating_hours[day]?.open ?? '07:00'} onChange={(event) => setHours(day, 'open', event.target.value)} />
                  <span className="text-muted-foreground">to</span>
                  <Input type="time" className="w-full sm:w-32" disabled={!open} value={restaurant.operating_hours[day]?.close ?? '22:00'} onChange={(event) => setHours(day, 'close', event.target.value)} />
                </div>
                <Switch className="hidden sm:inline-flex" checked={open} onCheckedChange={(value) => setHours(day, 'enabled', value)} />
              </div>
            );
          })}
          <Button onClick={saveGeneral} disabled={isSaving} className="w-full sm:w-auto">
            {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Current Password</Label>
            <Input
              type="password"
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              placeholder="Enter current password"
              autoComplete="current-password"
              className="sm:max-w-sm"
            />
            <p className="text-xs text-muted-foreground">
              Required, so a borrowed session cannot lock you out of your own account.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" />
            </div>
          </div>
          <Button onClick={submitPasswordChange} disabled={isSavingPwd} className="w-full sm:w-auto">
            {isSavingPwd ? 'Updating…' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>

      {/*
        Danger zone. Last card on the page, deliberately below Change Password so
        nothing destructive sits next to a field an owner edits day to day. Hidden
        entirely unless getRestaurantDeleteInfo succeeded, which is only for a
        RESTAURANT_OWNER; the server action is the actual gate.
      */}
      {deleteInfo && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete My Restaurant
            </CardTitle>
            <CardDescription>
              Permanently close {deleteInfo.restaurantName || 'this outlet'} and erase its data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-destructive/40 bg-destructive-surface p-4">
              <p className="text-sm font-semibold text-destructive-strong">
                This cannot be undone.
              </p>
              <p className="mt-2 text-sm text-foreground">
                Deleting removes your entire menu and categories, every table and QR code,
                all staff records, order history, customers, reservations, coupons and print
                settings. Every owner, reception and waiter login for this restaurant stops
                working immediately.
              </p>
            </div>

            {deleteInfo.billCount > 0 ? (
              // Blocked rather than warned: Nepal's IRD rules expect issued
              // invoices to be retained, which is why the billing engine voids
              // bills instead of deleting them.
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="text-sm font-medium">
                  {deleteInfo.billCount} tax invoice{deleteInfo.billCount === 1 ? '' : 's'} on record
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nepal&apos;s IRD rules require issued invoices to be kept, so this outlet
                  cannot be deleted from here. Raise a{' '}
                  <Link href="/owner/settings/support" className="font-medium text-primary hover:underline">
                    support request
                  </Link>{' '}
                  to close the account.
                </p>
              </div>
            ) : (
              <Button
                variant="destructive"
                onClick={() => {
                  setDeleteConfirm('');
                  setDeleteOpen(true);
                }}
                className="w-full gap-2 sm:w-auto"
              >
                <Trash2 className="h-4 w-4" />
                Delete My Restaurant
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (isDeleting) return;
          setDeleteOpen(open);
          if (!open) setDeleteConfirm('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Delete {deleteInfo?.restaurantName || 'this restaurant'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Everything belonging to this restaurant is erased and you will be signed out.
              There is no way to restore it.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="delete-confirm">
              Type <span className="font-semibold text-destructive-strong">
                {deleteInfo?.confirmationPhrase}
              </span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={deleteInfo?.confirmationPhrase}
              autoComplete="off"
              disabled={isDeleting}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            {/*
              A plain Button, not AlertDialogAction: the action variant closes the
              dialog on click, and this one has to stay open while the transaction
              runs and while an error is being reported.
            */}
            <Button
              variant="destructive"
              onClick={handleDeleteRestaurant}
              disabled={!deletePhraseMatches || isDeleting}
              className="gap-2"
            >
              {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin" />Deleting…</> : 'Delete Permanently'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="border-t pt-6">
        <p className="text-center text-sm text-muted-foreground">
          Made with ❤️ by <a href="https://www.drillthu.tech" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Drill Thru</a>
        </p>
      </div>
    </div>
  );
}
