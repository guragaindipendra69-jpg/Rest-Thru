'use client';

import { useEffect, useState } from 'react';
import { Loader2, Lock, Trash2, Unlock, UserPlus } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/auth-store';
import { toast } from 'sonner';

const EMPTY_FORM = { firstName: '', lastName: '', username: '', password: '', phoneNumber: '' };

/**
 * Console credentials for one role. Rendered twice on the staff page, once for
 * reception and once for waiters, with the matching pair of server actions.
 *
 * Hides itself when the signed-in user holds the role it manages, so a
 * receptionist cannot reissue their own login.
 */
export function StaffLoginsSection({
  role,
  title,
  description,
  createFn,
  listFn,
  toggleFn,
  deleteFn,
}: {
  role: string;
  title: string;
  description: string;
  createFn: (data: {
    firstName: string;
    lastName?: string;
    username: string;
    password: string;
    phoneNumber?: string;
  }) => Promise<any>;
  listFn: () => Promise<any>;
  toggleFn: (id: string) => Promise<any>;
  deleteFn?: (id: string) => Promise<any>;
}) {
  const { user } = useAuthStore();
  const [logins, setLogins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const fetchLogins = async () => {
    setLoading(true);
    const res = await listFn();
    if ('data' in res && res.data) setLogins(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchLogins(); }, []);

  const handleCreate = async () => {
    if (!form.firstName || !form.username || !form.password) {
      toast.error('First name, username, and password are required');
      return;
    }
    setCreating(true);
    const res = await createFn(form);
    setCreating(false);
    if ('error' in res) { toast.error(res.error); return; }
    toast.success(`${title.slice(0, -1)} created`);
    setShowCreate(false);
    setForm(EMPTY_FORM);
    fetchLogins();
  };

  const handleToggle = async (id: string) => {
    const res = await toggleFn(id);
    if ('error' in res) { toast.error(res.error); return; }
    toast.success('Login toggled');
    fetchLogins();
  };

  const handleDelete = async (id: string) => {
    if (!deleteFn) return;
    const res = await deleteFn(id);
    if ('error' in res) { toast.error(res.error); return; }
    toast.success('Login deleted permanently');
    fetchLogins();
  };

  const isOwner = user?.role === 'RESTAURANT_OWNER';

  if (user?.role === role) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <UserPlus className="w-4 h-4 mr-1" /> New Login
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showCreate && (
          <div className="mb-4 p-4 border rounded-lg space-y-3 bg-muted/30">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                placeholder="First name *"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
              <Input
                placeholder="Last name"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
              <Input
                placeholder="Gmail * (name@gmail.com)"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              <Input
                placeholder="Phone No (alternative login)"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              />
              <Input
                type="password"
                placeholder="Password * (min 6 chars)"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button size="sm" disabled={creating} onClick={handleCreate}>
                {creating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Create
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          // Matches the row geometry below (rounded muted block, name line plus
          // a smaller meta line) so the list doesn't jump when it resolves. Kept
          // separate from the "No ... created yet" branch: an owner must be able
          // to tell a list still loading from one that is genuinely empty,
          // because the second is what prompts them to create a login.
          <div className="space-y-2" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading {title.toLowerCase()}</span>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-lg bg-muted/50 p-3 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            ))}
          </div>
        ) : logins.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No {title.toLowerCase()} created yet.
          </p>
        ) : (
          <div className="space-y-2">
            {logins.map((l: any) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{l.firstName} {l.lastName}</span>
                    <span className="text-xs text-muted-foreground">@{l.username}</span>
                    {l.phoneNumber && (
                      <span className="text-xs text-muted-foreground">| {l.phoneNumber}</span>
                    )}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${l.isActive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}
                    >
                      {l.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {l.lastLoginAt && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Last login: {new Date(l.lastLoginAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(l.id)}
                    aria-label={l.isActive ? 'Deactivate login' : 'Activate login'}
                  >
                    {l.isActive ? (
                      <Lock className="w-3 h-3 text-destructive" />
                    ) : (
                      <Unlock className="w-3 h-3 text-success" />
                    )}
                  </Button>
                  {isOwner && deleteFn && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label="Delete login">
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {title.slice(0, -1)} Login</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete <strong>{l.firstName} {l.lastName}</strong>
                            &apos;s login (@{l.username}
                            {l.phoneNumber ? ` | ${l.phoneNumber}` : ''}). This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(l.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
