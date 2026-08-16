'use client';

import React, { useMemo, useEffect, useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Search,
  Bell,
  Menu,
  LogOut,
  Settings,
  HelpCircle,
  User,
  ShoppingCart,
  AlertTriangle,
  Receipt,
  Info,
  CheckCheck,
  ChevronRight,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import SyncIndicator from '@/components/dashboard/sync-indicator';
import { useUIStore } from '@/store/ui-store';
import { useAuthStore } from '@/store/auth-store';
import { useNotificationsStore, AppNotification } from '@/store/notifications-store';
import { useWaiterOrderStore } from '@/store/waiter-order-store';
import { cn } from '@/lib/utils';
import { resolveNotificationUrl } from '@/lib/notification-route';
import { formatDistanceToNow } from 'date-fns';

// Portal roots. Everything below a root is derived from the URL, so adding a
// route never means editing this file.
const PORTAL_ROOTS: Record<string, string> = {
  '/owner': 'Dashboard',
  '/reception': 'Reception Desk',
  '/order': 'Order Station',
};

// Only the segments whose humanised form would read wrong -- acronyms and
// names that expand. Everything else falls through to `humanise`, which turns
// "users-role" into "Users Role" without needing an entry.
const SEGMENT_LABELS: Record<string, string> = {
  billing: 'Billing & Subscription',
  combo: 'Combo Offer',
  crm: 'CRM & Discounts',
  invoice: 'Invoice Setting',
  kot: 'KOT Setting',
  logs: 'Activity Logs',
  order: 'New Order',
  prints: 'Print Center',
  qr: 'QR Codes',
  reports: 'Reports & Analytics',
  staff: 'Staff Management',
  support: 'Support & Feedback',
  tax: 'Tax & VAT',
};

/** cuid / uuid route params — a raw id must never surface in a breadcrumb. */
const isIdSegment = (segment: string) =>
  /^[0-9a-f-]{16,}$/i.test(segment) || /^c[a-z0-9]{20,}$/i.test(segment);

const humanise = (segment: string) =>
  segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * Breadcrumb trail for the current path.
 *
 * This replaced a hand-maintained `PAGE_TITLES` path→label map that had gone
 * stale: it covered 22 of the 61 owner and reception routes, and its
 * `|| 'Dashboard'` fallback meant the other 39 — every /owner/settings/*
 * sub-page among them — announced themselves as "Dashboard". Deriving from the
 * URL cannot drift, and a trail (rather than a bare title) is what tells you
 * where you are once settings pages nest two levels deep.
 */
function buildCrumbs(pathname: string): Array<{ label: string; href: string }> {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [];

  const root = `/${segments[0]}`;
  const crumbs = [
    { label: PORTAL_ROOTS[root] ?? humanise(segments[0]), href: root },
  ];

  let href = root;
  for (const segment of segments.slice(1)) {
    href += `/${segment}`;
    crumbs.push({
      label: isIdSegment(segment)
        ? 'Details'
        : SEGMENT_LABELS[segment] ?? humanise(segment),
      href,
    });
  }
  return crumbs;
}

const NOTIF_ICONS: Record<AppNotification['type'], React.ReactNode> = {
  order:  <ShoppingCart className="h-4 w-4 text-primary" />,
  stock:  <AlertTriangle className="h-4 w-4 text-warning" />,
  bill:   <Receipt className="h-4 w-4 text-success" />,
  system: <Info className="h-4 w-4 text-muted-foreground" />,
};

function NotificationItem({
  notification,
  onRead,
  onDismiss,
  onView,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onView: (n: AppNotification) => void;
}) {
  const viewUrl = resolveNotificationUrl(notification);
  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer',
        !notification.isRead && 'bg-primary/5'
      )}
      onClick={() => (viewUrl ? onView(notification) : !notification.isRead && onRead(notification.id))}
    >
      {/* Icon */}
      <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
        {NOTIF_ICONS[notification.type]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-snug', !notification.isRead ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}>
          {notification.title}
        </p>
        {notification.message && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.message}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[11px] text-muted-foreground/70">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
          {viewUrl && (
            <button
              onClick={(e) => { e.stopPropagation(); onView(notification); }}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              {notification.relatedEntityType === 'Order' ? 'View Order' : 'View'}
            </button>
          )}
        </div>
      </div>

      {/* Unread dot + dismiss */}
      <div className="flex flex-col items-center gap-2 flex-shrink-0">
        {!notification.isRead && (
          <span className="h-2 w-2 rounded-full bg-primary mt-1" />
        )}
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          onClick={(e) => { e.stopPropagation(); onDismiss(notification.id); }}
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function TopHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, setMobileMenuOpen } = useUIStore();
  const { user, restaurant, logout } = useAuthStore();
  const { notifications, unreadCount, isLoading, fetch, markRead, markAllRead, dismiss } = useNotificationsStore();
  const isOrderPage = pathname === '/order';
  const orderSearch = useWaiterOrderStore((s) => s.setSearchQuery);
  const orderSearchValue = useWaiterOrderStore((s) => s.searchQuery);

  // This header renders in both the owner and reception shells, so every
  // in-app link has to be resolved against the portal the user is actually in.
  // Hardcoding /owner/* sent a receptionist to a route their session cannot
  // open, and middleware bounced them to the owner login screen.
  const portal = pathname?.startsWith('/reception') ? '/reception' : '/owner';

  const crumbs = useMemo(() => buildCrumbs(pathname ?? ''), [pathname]);
  const todayDate = useMemo(() => format(new Date(), 'MMMM d, yyyy'), []);
  const userInitials = useMemo(() => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
    }
    return 'U';
  }, [user]);

  // Fetch notifications when restaurant is known
  useEffect(() => {
    if (restaurant?.id) {
      fetch();
    }
  }, [restaurant?.id, fetch]);

  const handleMarkAllRead = useCallback(() => {
    markAllRead();
  }, [restaurant?.id, markAllRead]);

  const [notifOpen, setNotifOpen] = useState(false);

  /** Opening a notification marks it read, closes the panel and navigates. */
  const handleView = useCallback(
    (n: AppNotification) => {
      const url = resolveNotificationUrl(n);
      if (!n.isRead) markRead(n.id);
      setNotifOpen(false);
      if (url) router.push(url);
    },
    [markRead, router]
  );

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-16 bg-card border-b border-border flex items-center px-4 gap-3 z-40 transition-[left] duration-300 left-0',
        sidebarCollapsed ? 'md:left-[68px]' : 'md:left-[248px]'
      )}
    >
      {/* Left: mobile toggle + breadcrumb */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden flex-shrink-0"
        >
          <Menu className="h-5 w-5" />
        </Button>
        {/* Orientation only. The page owns its <h1> via PageHeader, so this is
            a breadcrumb trail rather than a second competing title. Below `sm`
            only the current crumb and no date, to keep a phone header to one
            line. */}
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-1.5">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <li
                  key={crumb.href}
                  className={cn(
                    'flex min-w-0 items-center gap-1.5',
                    !isLast && 'hidden sm:flex'
                  )}
                >
                  {isLast ? (
                    <span
                      aria-current="page"
                      className="truncate text-base font-bold leading-tight text-foreground"
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <>
                      <Link
                        href={crumb.href}
                        className="truncate text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
                      >
                        {crumb.label}
                      </Link>
                      <ChevronRight
                        className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="hidden text-xs text-muted-foreground sm:block">{todayDate}</p>
        </nav>
      </div>

      {/* Center: search (wired to waiter-order-store when on /order) */}
      <div className="hidden md:flex flex-1 max-w-sm">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isOrderPage ? 'Search menu items or codes...' : 'Search orders, menu, staff...'}
            value={isOrderPage ? orderSearchValue : undefined}
            onChange={(e) => isOrderPage ? orderSearch(e.target.value) : null}
            className="pl-9 h-9 bg-background text-sm"
          />
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {/* Sync status */}
        <SyncIndicator />
        {/* ── Notification Bell ── */}
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            sideOffset={8}
            collisionPadding={8}
            /* 92vw cap matches components/shared/alert-toast.tsx. A bare
               w-[360px] anchored to a bell inside the header's px-4 leaves ~1px
               of slack at 375px and overflows a 360px Android outright, at which
               point Radix clamps it flush to both screen edges. */
            className="w-[360px] max-w-[92vw] p-0 shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <Badge className="bg-primary/10 text-primary border-0 text-[11px] h-5 px-1.5">
                    {unreadCount} new
                  </Badge>
                )}
              </div>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllRead}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </Button>
              )}
            </div>

            {/* List */}
            {/* max-height and overflow on the same element. A ScrollArea Root
                given only a max-height stays `height: auto`, so its `h-full`
                viewport grows past the cap and gets clipped with no scrollbar
                -- notifications past 420px became unreachable. */}
            <div className="max-h-[420px] overflow-y-auto">
              {isLoading ? (
                // Shaped like NotificationItem below (8x8 rounded icon, two text
                // lines) so the panel doesn't reflow when the rows arrive. The
                // empty branch stays a distinct "All caught up!" message: an
                // inbox that is still loading and an inbox with nothing in it
                // must not look the same.
                <div className="divide-y divide-border" aria-busy="true" aria-live="polite">
                  <span className="sr-only">Loading notifications</span>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3">
                      <Skeleton className="mt-0.5 h-8 w-8 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-2/5" />
                        <Skeleton className="h-3 w-4/5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-14 flex flex-col items-center gap-2 text-muted-foreground">
                  <Bell className="h-8 w-8 opacity-20" />
                  <p className="text-sm font-medium">All caught up!</p>
                  <p className="text-xs">No notifications right now.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onRead={markRead}
                      onDismiss={dismiss}
                      onView={handleView}
                    />
                  ))}
                </div>
              )}
            </div>

            {user?.role !== "RECEPTIONIST" && notifications.length > 0 && (
              <>
                <Separator />
                <div className="px-4 py-2.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => router.push(`${portal}/settings/notifications`)}
                  >
                    Notification settings
                  </Button>
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 px-2 hover:bg-accent">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <p className="font-semibold text-sm">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground font-normal">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {user?.role !== "RECEPTIONIST" && (
              <DropdownMenuItem onClick={() => router.push(`${portal}/settings`)}>
                <User className="mr-2 h-4 w-4" /> Profile
              </DropdownMenuItem>
            )}
            {user?.role !== "RECEPTIONIST" && (
              <DropdownMenuItem onClick={() => router.push(`${portal}/settings`)}>
                <Settings className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem>
              <HelpCircle className="mr-2 h-4 w-4" /> Help & Support
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
