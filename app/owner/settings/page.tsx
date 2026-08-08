'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Upload } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { uploadImage } from '@/lib/upload';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth-store';
import {
  getRestaurant, updateRestaurant, updateCoverPhoto, setUserPassword, saveOperatingHours,
} from '@/lib/actions/settings';

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
  const { restaurant: authRestaurant, user } = useAuthStore();
  const restaurantId = authRestaurant?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPwd, setIsSavingPwd] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

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
      const restRes = await getRestaurant(restaurantId);

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

  const changePassword = async () => {
    if (!newPwd) {
      toast.error('Enter a new password');
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error('Passwords do not match');
      return;
    }
    setIsSavingPwd(true);
    const result = await setUserPassword(user?.id || '', newPwd);
    setIsSavingPwd(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Password updated');
    setNewPwd('');
    setConfirmPwd('');
  };

  const handleCoverUpload = async (file: File) => {
    setIsUploadingCover(true);
    const url = await uploadImage(file, 'covers');
    if (url) {
      const result = await updateCoverPhoto(restaurantId!, url);
      if (!result.error) {
        setRestaurant((prev) => ({ ...prev, cover_url: url }));
        toast.success('Cover uploaded');
      } else {
        toast.error('Cover upload failed');
      }
    } else {
      toast.error('Cover upload failed');
    }
    setIsUploadingCover(false);
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
              <input type="file" accept="image/*" className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setCoverPreview(URL.createObjectURL(file));
                  handleCoverUpload(file);
                }
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Enter new password" />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Confirm new password" />
            </div>
          </div>
          <Button onClick={changePassword} disabled={isSavingPwd} className="w-full sm:w-auto">
            {isSavingPwd ? 'Updating…' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>

      <div className="border-t pt-6">
        <p className="text-center text-sm text-muted-foreground">
          Made with ❤️ by <a href="https://www.drillthu.tech" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Drill Thru</a>
        </p>
      </div>
    </div>
  );
}
