// Nepal Cities
export const NEPAL_CITIES = [
  'Kathmandu',
  'Pokhara',
  'Chitwan',
  'Biratnagar',
  'Lalitpur',
  'Bhaktapur',
  'Bharatpur',
  'Butwal',
  'Birgunj',
  'Dharan',
  'Hetauda',
  'Nepalgunj',
  'Janakpur',
  'Siddharthanagar',
  'Mechinagar',
];

// Restaurant Types
export const RESTAURANT_TYPES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'bar', label: 'Bar' },
  { value: 'fast_food', label: 'Fast Food' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'mixed', label: 'Mixed' },
];

// Payment Methods
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: 'Banknote' },
  { value: 'esewa', label: 'eSewa', icon: 'Wallet' },
  { value: 'khalti', label: 'Khalti', icon: 'CreditCard' },
  { value: 'fonepay', label: 'Fonepay', icon: 'Smartphone' },
];

// Spice Levels
export const SPICE_LEVELS = [
  { value: 'none', label: 'None', icon: '😊' },
  { value: 'mild', label: 'Mild', icon: '🌶️' },
  { value: 'medium', label: 'Medium', icon: '🌶️🌶️' },
  { value: 'hot', label: 'Hot', icon: '🌶️🌶️🌶️' },
  { value: 'extra_hot', label: 'Extra Hot', icon: '🌶️🌶️🌶️🌶️' },
];

// Chart series palette, mirroring --chart-1..6 in app/globals.css.
//
// Recharts needs a resolved colour for the SVG `fill` attribute, and these
// values are built in Server Actions where no stylesheet is in scope, so the
// tokens cannot be read through var(). Written in the legacy comma form
// because that is what an SVG presentation attribute parses everywhere.
//
// Every entry clears 3:1 against --card. The raw Tailwind hexes this replaced
// did not: emerald-500 measured 2.5:1, amber-500 2.1:1, cyan-500 2.3:1, so a
// pie slice could be all but invisible against the card holding it.
// scripts/check-contrast.mjs guards the tokens; this array only mirrors them,
// so if a --chart-N value moves, move it here in the same commit.
export const CHART_SERIES = [
  'hsl(163, 81%, 23%)', // chart-1  jewel emerald
  'hsl(11, 100%, 61%)', // chart-2  coral
  'hsl(221, 83%, 53%)', // chart-3  blue
  'hsl(38, 87%, 42%)',  // chart-4  amber
  'hsl(262, 60%, 55%)', // chart-5  violet
  'hsl(187, 72%, 38%)', // chart-6  teal
] as const;

/** Cycle the palette for a series of arbitrary length. */
export const chartColor = (i: number): string =>
  CHART_SERIES[((i % CHART_SERIES.length) + CHART_SERIES.length) % CHART_SERIES.length];

// Stable slot per payment method, so a method keeps its colour between
// renders instead of shifting when a different method appears in the data.
// There are seven methods and six accessible series, so QR doubles up with
// CASH -- both slices carry a text label, and the two rarely co-occur.
const PAYMENT_SLOT: Record<string, number> = {
  CASH: 0, CARD: 2, ESEWA: 4, KHALTI: 1, FONEPAY: 5, MOBILE: 3, ONLINE: 4, QR: 0,
};

/** Chart colour for a payment method, falling back to the first series. */
export const paymentColor = (method: string): string =>
  chartColor(PAYMENT_SLOT[method?.toUpperCase()] ?? 0);

// Food Types (broad category)
export const FOOD_TYPES = [
  { value: 'veg',     label: 'Veg',     color: '#22c55e' },
  { value: 'non_veg', label: 'Non-veg', color: '#ef4444' },
  { value: 'vegan',   label: 'Vegan',   color: '#eab308' },
  { value: 'fish',    label: 'Fish',    color: '#3b82f6' },
];

// Food Sub-types (meat type for non-veg items)
export const FOOD_SUB_TYPES = [
  { value: 'veg',     label: 'Veg',     color: '#22c55e', emoji: '🥦' },
  { value: 'chicken', label: 'Chicken', color: '#f97316', emoji: '🍗' },
  { value: 'buff',    label: 'Buff',    color: '#dc2626', emoji: '🐃' },
  { value: 'pork',    label: 'Pork',    color: '#ec4899', emoji: '🐷' },
  { value: 'mutton',  label: 'Mutton',  color: '#7c3aed', emoji: '🐑' },
];

// Allergens
export const ALLERGENS = [
  'Nuts',
  'Dairy',
  'Gluten',
  'Eggs',
  'Soy',
  'Shellfish',
  'Sesame',
  'Mustard',
];

// Order Statuses
export const ORDER_STATUSES = [
  { value: 'pending', label: 'Pending', color: '#f59e0b' },
  { value: 'confirmed', label: 'Confirmed', color: '#3b82f6' },
  { value: 'preparing', label: 'Preparing', color: '#8b5cf6' },
  { value: 'ready', label: 'Ready', color: '#06b6d4' },
  { value: 'delivered', label: 'Delivered', color: '#22c55e' },
  { value: 'cancelled', label: 'Cancelled', color: '#ef4444' },
];

// Table Statuses
export const TABLE_STATUSES = [
  { value: 'available', label: 'Available', color: '#22c55e' },
  { value: 'occupied', label: 'Occupied', color: '#ef4444' },
  { value: 'reserved', label: 'Reserved', color: '#f59e0b' },
  { value: 'maintenance', label: 'Maintenance', color: '#6b7280' },
];

// Staff Roles
export const STAFF_ROLES = [
  { value: 'manager', label: 'Manager', color: '#3b82f6' },
  { value: 'chef', label: 'Chef', color: '#8b5cf6' },
  { value: 'waiter', label: 'Waiter', color: '#06b6d4' },
  { value: 'cashier', label: 'Cashier', color: '#22c55e' },
  { value: 'kitchen_staff', label: 'Kitchen Staff', color: '#f59e0b' },
];

// Plan Types
export const PLAN_TYPES = [
  { value: 'free', label: 'Free', color: '#6b7280' },
  { value: 'basic', label: 'Basic', color: '#3b82f6' },
  { value: 'pro', label: 'Pro', color: '#8b5cf6' },
  { value: 'enterprise', label: 'Enterprise', color: '#ef4444' },
];

// Plans — MUST stay in sync with lib/plan-limits.ts (the enforced caps) and the
// `plans` rows in the DB (the billed prices). These are the exact numbers the
// plan guard enforces, so what a customer is shown here is what they actually
// get. Shown on /pricing and the register plan picker.
export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    yearlyPrice: 0,
    currency: 'NPR',
    features: [
      'Up to 5 tables',
      'Up to 10 staff members',
      'Up to 10 menu items',
      'QR ordering',
      'Email support',
      '✗ Thermal printer support',
      '✗ IRD-compliant VAT billing',
      '✗ Multi-branch support',
      '✗ Real-time analytics',
    ],
    isPopular: false,
    color: '#6b7280',
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 1999,
    yearlyPrice: 23988,
    currency: 'NPR',
    features: [
      'Up to 20 tables',
      'Up to 10 staff members',
      'Up to 50 menu items',
      'Order tracking',
      'Staff management',
      'Thermal printer support',
      'Priority email support',
      '✗ IRD-compliant VAT billing',
      '✗ Multi-branch support',
      '✗ Real-time analytics',
    ],
    isPopular: false,
    color: '#3b82f6',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 3999,
    yearlyPrice: 47988,
    currency: 'NPR',
    features: [
      'Up to 50 tables',
      'Up to 50 staff members',
      'Up to 200 menu items',
      'Up to 3 branches',
      'IRD-compliant VAT billing',
      'Real-time analytics',
      'Multiple payment methods',
      'API access',
      'Phone & email support',
    ],
    isPopular: true,
    color: '#8b5cf6',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 9999,
    yearlyPrice: 119988,
    currency: 'NPR',
    features: [
      'Everything in Pro',
      'Unlimited tables, staff & menu items',
      'Unlimited branches',
      'Custom integrations',
      'Dedicated account manager',
      'White-label options',
      'Priority 24/7 support & SLA',
    ],
    isPopular: false,
    color: '#ef4444',
  },
];

// VAT Rate
export const VAT_RATE = 13;

// Currency
export const CURRENCY = 'NPR';
export const CURRENCY_SYMBOL = 'NPR';

// Default spaces seeded for a new restaurant. The Table Map page manages the
// real, per-restaurant list via the Space model (lib/actions/spaces.ts) —
// this constant is only a fallback while that list is still loading.
export const SPACES = ['Space 1', 'Space 2', 'Space 3'];

// Table Shapes
export const TABLE_SHAPES = [
  { value: 'round', label: 'Round', capacity: 4 },
  { value: 'square', label: 'Square', capacity: 4 },
  { value: 'rectangular', label: 'Rectangular', capacity: 6 },
  { value: 'long', label: 'Long', capacity: 8 },
];

// Bill Status Colors
export const BILL_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-warning/10 text-warning',
  HELD: 'bg-info/10 text-info',
  PAID: 'bg-success/10 text-success',
  VOID: 'bg-destructive/10 text-destructive',
};

// Superadmin badge tone classes (G5). Every superadmin page used to
// re-declare its own `Record<string, string>` mapping a status label to the
// exact same handful of Tailwind combos (bg-primary/10 text-primary
// border-primary/30, etc). This is the one shared source for those combos —
// pages still define which *label* maps to which tone (their vocabulary
// differs: "Compliant" vs "Published" vs "ACTIVE"), but the actual color
// values live here once.
export const ADMIN_TONE_CLASSES = {
  positive: 'bg-primary/10 text-primary border-primary/30',
  warning: 'bg-warning-surface text-warning-strong border-warning/30',
  negative: 'bg-destructive/10 text-destructive border-destructive/30',
  info: 'bg-info/10 text-info border-info/30',
  neutral: 'bg-muted-foreground/10 text-muted-foreground border-muted-foreground/30',
} as const;

export type AdminTone = keyof typeof ADMIN_TONE_CLASSES;

/**
 * Shared badge-variant map for recurring status labels across superadmin pages.
 * Every page used to re-declare its own `Record<string, string>` mapping
 * "Compliant"/"Active"/"Published" etc. to the same three tone classes —
 * now they all reference this one map.  Pages that need additional labels
 * (e.g. "Running" → "positive") extend it locally.
 */
export const STATUS_BADGE_VARIANTS: Record<string, keyof typeof ADMIN_TONE_CLASSES> = {
  Compliant: 'positive',
  Active: 'positive',
  Published: 'positive',
  Running: 'positive',
  Complete: 'info',
  Analyzing: 'warning',
  'Action Required': 'warning',
  Pending: 'warning',
  Draft: 'warning',
  'Non-Compliant': 'negative',
};

// ── The one staff login door ──
//
// Every restaurant role — owner, legacy STAFF, receptionist and waiter — signs in
// at this single form. `login()` then routes them to their own portal by role, so
// nobody has to know which URL belongs to their job. The four portals still have
// four separate session cookies (see SESSION_PORTALS below); one shared *door* is
// not one shared session.
//
// /superadmin/login stays its own door deliberately. `login()` enforces the
// separation both ways — `adminConsole: true` refuses non-admins there and
// `blockAdmin: true` refuses admins here — so a platform admin's password typed
// into the staff form is rejected with the same generic message as a wrong one.
export const SHARED_LOGIN_PATH = '/login';

// Dashboard routes that render without the authenticated shell (sidebar/header) — the single
// source of truth so proxy.ts and app/owner/layout.tsx can't drift out of sync.
//
// `/owner/login` is still listed even though the proxy now turns unauthenticated
// requests away to SHARED_LOGIN_PATH directly: the page is a redirect stub for
// links already bookmarked on station tablets, and it has to stay publicly
// renderable for that forward to happen. Dropping it from here would bounce an
// anonymous visitor to /login?redirect=/owner/login, which after a successful
// sign-in would land them back on the stub.
export const DASHBOARD_AUTH_ROUTES = [
  '/owner/login',
  '/owner/forgot-password',
  '/owner/password-reset',
] as const;

// Superadmin routes that render without the authenticated admin shell — kept
// here (next to DASHBOARD_AUTH_ROUTES) so proxy.ts and the superadmin
// layout share one source of truth instead of an inline list.
export const SUPERADMIN_AUTH_ROUTES = ['/superadmin/login'] as const;

// Waiter order-station routes that render without a session — the retired waiter
// login URL, now a redirect stub. Shared by proxy.ts (skip the auth redirect here
// so the stub can't be bounced back to itself) and app/order/layout.tsx (skip the
// guard) so the two never drift.
export const ORDER_AUTH_ROUTES = ['/order/login'] as const;

// The reception equivalent. Reception was the one portal with no entry here and
// no stub pages, which broke the case the other two exist for: the proxy turned
// an anonymous /reception/login away to /login?redirect=/reception/login, that
// target is same-origin and inside the receptionist's own portal so
// safeRedirectForRole passed it, and nothing was mounted there - so correct
// credentials produced a hard 404. Reception is the portal most likely to be
// bookmarked on a till, and `/reception/order/login` is named as a retired URL
// in login-redirect.tsx's own docstring, so both are stubbed.
export const RECEPTION_AUTH_ROUTES = [
  '/reception/login',
  '/reception/order/login',
] as const;

// Canonical landing route for each role. Legacy STAFF maps to the owner
// dashboard. Kept edge-safe (no server-only imports) so proxy.ts can
// import it too. Used to bounce an authenticated-but-wrong-role user back to
// their own area instead of leaking a cross-role screen.
export const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: '/superadmin',
  ADMIN: '/superadmin',
  RESTAURANT_OWNER: '/owner',
  STAFF: '/owner',
  RECEPTIONIST: '/reception',
  WAITER: '/order',
};

export function homeForRole(role: string | null | undefined): string {
  return (role && ROLE_HOME[role]) || '/owner';
}

/**
 * Where a just-signed-in user actually lands, given the `?redirect=` the proxy
 * forwarded. Falls back to their own role home whenever the target isn't one
 * they may have.
 *
 * The single shared login form now receives this parameter on behalf of all four
 * portals, so it is attacker-supplied input reaching a navigation. Two things are
 * checked:
 *
 *  - It must be a same-origin absolute path. `//evil.com` is a protocol-relative
 *    URL that browsers treat as another origin, and a backslash is folded to `/`
 *    by some parsers, so both are rejected along with anything not starting `/`.
 *    Without this, /login?redirect=https://evil.com would be an open redirect off
 *    a trusted domain — exactly the shape a phishing link wants.
 *  - It must belong to the signing-in user's own portal. A waiter following a
 *    stale /reception link would otherwise be sent somewhere `guardArea` bounces
 *    them straight back out of, which reads as a broken login rather than a
 *    blocked one. Paths outside all four portals fall back too, so a redirect
 *    cannot be used to land a fresh session on an arbitrary public page.
 */
export function safeRedirectForRole(
  role: string | null | undefined,
  target: string | null | undefined
): string {
  const home = homeForRole(role);
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) {
    return home;
  }
  // Compare on the path alone: a ?query or #hash of its own must not shift which
  // portal the target is judged to be in.
  const path = target.split(/[?#]/)[0];
  return portalForPath(path) === portalForRole(role) ? target : home;
}

// ── Session portals ──
// Each portal (superadmin console, owner dashboard, reception, waiter station)
// gets its OWN session cookie, so logging in or out as one role never touches
// another role's session in the same browser. Kept edge-safe (no server-only
// imports) so proxy.ts can use these too.
export type SessionPortal = 'admin' | 'owner' | 'reception' | 'waiter';

// Order matters: it's the lookup priority when a request outside any portal
// (home page, /login) needs "whoever is signed in".
export const SESSION_PORTALS: readonly SessionPortal[] = ['owner', 'admin', 'reception', 'waiter'];

export function portalForRole(role: string | null | undefined): SessionPortal {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return 'admin';
    case 'RECEPTIONIST':
      return 'reception';
    case 'WAITER':
      return 'waiter';
    default:
      // RESTAURANT_OWNER, legacy STAFF, managers — all live in the owner portal.
      return 'owner';
  }
}

export function portalForPath(pathname: string | null | undefined): SessionPortal | null {
  if (!pathname) return null;
  if (pathname === '/superadmin' || pathname.startsWith('/superadmin/')) return 'admin';
  if (pathname === '/owner' || pathname.startsWith('/owner/')) return 'owner';
  if (pathname === '/reception' || pathname.startsWith('/reception/')) return 'reception';
  if (pathname === '/order' || pathname.startsWith('/order/')) return 'waiter';
  return null;
}

export function sessionCookieName(portal: SessionPortal): string {
  return `session_${portal}`;
}

// Operating Hours Default
export const OPERATING_HOURS_DEFAULT = {
  monday: { open: '10:00', close: '22:00' },
  tuesday: { open: '10:00', close: '22:00' },
  wednesday: { open: '10:00', close: '22:00' },
  thursday: { open: '10:00', close: '22:00' },
  friday: { open: '10:00', close: '22:00' },
  saturday: { open: '10:00', close: '22:00' },
  sunday: { open: '10:00', close: '22:00' },
};
