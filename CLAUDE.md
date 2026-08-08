# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev              # Next.js dev server with Turbopack (port 3000)
npm run build            # Production build (runs prisma generate first)
npm run typecheck        # TypeScript type checking — currently passes clean
```

**Linting is currently broken; use `npm run typecheck` as the static-analysis gate.** Two independent failures:
1. `npm run lint` runs `next lint`, which was removed in Next 16. It misparses `lint` as a directory path and dies with "Invalid project directory provided".
2. Invoking ESLint directly (`npx eslint .`) also fails: the installed `eslint-config-next` imports `zod/v4/core`, but the project is pinned to `zod@^3.23.8`, so the config file cannot be read (`ERR_PACKAGE_PATH_NOT_EXPORTED`).

Fixing this means repointing the `lint` script at `eslint` and reconciling the zod major version with what `eslint-config-next` expects.

### Database
```bash
npm run db:push          # Push schema changes to database (dev)
npm run db:migrate       # Create and run a new migration
npm run db:migrate:deploy # Deploy migrations (production)
npm run db:studio        # Open Prisma Studio
npm run db:reset         # Reset database and re-seed
npm run db:seed          # Seed database
```

### Verification
```bash
npm run verify:billing   # Bill calculation test suite (scripts/verify-billing.ts) — all checks pass
npm run verify:contrast  # WCAG contrast audit of the token layer — 68/68 pairs pass
```

These are the two automated suites in the repo. There are no `.test.*` / `.spec.*` files and no vitest, jest, or playwright config anywhere.

`verify:billing` asserts the `lib/billing/` engine against the worked examples in `bill-design.md`: both pricing modes, discount-before-VAT, Schedule 1 exempt handling, float-drift resistance, abbreviated-invoice and buyer-PAN thresholds, the digital rebate, and NPR amount-in-words (including lakh/crore).

`verify:contrast` (`scripts/check-contrast.mjs`) parses the HSL triplets out of `app/globals.css` `:root` and checks every foreground/background pairing the UI renders, including hover and focus states. **Run it after any change to a token, a hover state, or a `text-*/NN` class.** Two properties matter when working on it:

- It composites alpha. `white/50` or `muted-foreground/70` is blended over its actual backdrop before measuring, and a background may itself be a stack (`white/9 on sidebar-raised`) for the translucent marketing panels. Reading class names is not enough — a faded foreground is whatever it becomes once the surface shows through.
- A failing pair is not automatically a token bug. Confirm what the component actually renders first: the `brand` button variant swaps its ink to white on hover, so the pair under the pointer is not the resting pair.

The verify skill (`.claude/skills/verify/SKILL.md`) documents how to launch the app and drive server actions via curl for end-to-end testing, including how to recover live action IDs (the on-disk manifest is stale under Turbopack dev).

## Architecture

### Authentication and tenant isolation

**Four independent session cookies** power four portals. Each portal (superadmin console, owner dashboard, reception, waiter station) has its own session cookie (`session_admin`, `session_owner`, `session_reception`, `session_waiter`) so one browser can hold all four sessions simultaneously. Logging in or out of one portal never affects another.

**Two-layer auth gate:**
1. `proxy.ts` (middleware) — primary gate for `/superadmin`, `/owner`, `/reception`, `/order`. Reads the cookie, verifies the JWT, checks that the role belongs to that portal, redirects to login if invalid.
2. `lib/auth-guard.ts` — layout-level belt-and-suspenders. Server Component layouts call `guardArea()` to repeat the session check so a request that somehow bypasses middleware still cannot render authenticated content.

**Tenant-scoped authorization** (`lib/auth-tenant.ts`) is the rule for Server Actions: `restaurantId` always comes from the session, never from the caller. Every action in `lib/actions/*` that touches restaurant data calls `requireTenant()` first, which returns a discriminated union. The session's `restaurantId` becomes the sole source for all queries. This prevents a signed-in user from another restaurant reading or mutating your data by passing your public `restaurantId` (printed on every table QR) to an action endpoint.

Role sets in `auth-tenant.ts`: `OWNER_ROLES` (owner + legacy STAFF), `FRONT_OF_HOUSE_ROLES` (owner + staff + receptionist), `ALL_TENANT_ROLES` (includes waiter).

### Multi-portal UI sharing

Owner and reception portals share substantial UI. Pattern:
- Shared page logic lives in `components/settings/*.tsx` or `components/dashboard/*.tsx`
- Both `app/owner/settings/kot/page.tsx` and `app/reception/settings/kot/page.tsx` import and render the same `KotSettingPage` component
- The component itself calls tenant-scoped actions that work for any front-of-house role

### Plan-based feature gating

**lib/plan-guard.ts** and **lib/plan-limits.ts** enforce per-plan caps on tables, staff, and menu items. Every create action for a gated resource calls `checkResourceLimit(restaurantId, resource)` before the insert. If the restaurant is at its cap, the action returns `{ error, limitReached }` and the UI renders an upgrade prompt.

Plan type resolution: a restaurant with no active subscription defaults to FREE (most restrictive). The guard runs one indexed query on create attempts only, never on reads.

### IRD Nepal compliant billing

**bill-design.md is the spec of record.** The entire `lib/billing/` module implements it:
- `config.ts` — every rate, threshold, header string configurable (VAT rate, service charge %, buyer PAN threshold, abbreviated invoice threshold). Defaults for FY 2082/83 to 2083/84.
- `calculate.ts` — the calculation engine. Two pricing modes: INCLUSIVE (menu price is final, VAT back-calculated) and ADDITIVE (menu price is pre-VAT base, service + VAT stacked on top). All intermediate sums run through paisa (integer minor units) so float accumulation cannot drift across a long bill. Rounding happens once at the total.
- `fiscal-year.ts` — Nepali fiscal year handling (Shrawan 1 to Asar end), invoice serial numbering, BS date formatting.
- `amount-in-words.ts` — NPR grand total in words, switching to "lakh" past 99,999.

**Race-free invoice numbering:** `lib/actions/billing.ts` allocates the sequence inside a transaction and relies on the `@@unique([restaurantId, fiscalYear, sequence])` constraint to prevent duplicate tax-invoice numbers under concurrent checkouts. A P2002 unique violation triggers a retry (max 5 attempts). Voided bills keep their sequence and are marked VOID rather than deleted (IRD audit trail requirement).

**Bill model columns:** The schema carries every IRD-mandated field: `fiscalYear`, `sequence`, `billDateBS`, `pricingMode`, `isAbbreviated`, `exemptAmount`, `buyerName`, `buyerPan`, `buyerAddress`, `cbmsStatus`, `cbmsSyncedAt`, `voidReason`. CBMS sync is queued (`PENDING` status) and never blocks closing a ticket.

**Editing `bill-design.md` has house rules** (stated in its own section 2): no em/en dashes, no emoji, and — the one that constrains code — **no hardcoded rates or thresholds**. Every VAT rate, service-charge percent, PAN threshold, and CBMS turnover figure must be a named config value, because Nepal's Finance Act revises them most fiscal years (effective Shrawan 1) and a literal means a code release each time. Where sources genuinely conflict, the spec marks the value "Unconfirmed" and it must stay configurable rather than being silently settled; `config.ts` carries those markers through in comments.

### Real-time sync

`lib/sync.ts` combines **Server-Sent Events** (SSE, endpoint `/api/sync/events`) with **BroadcastChannel** for cross-tab sync. The SSE route sends a heartbeat every 15s and auto-cleans up on disconnect. The client calls `startSync()` on mount, registers listeners with `onSyncEvent(fn)`, and broadcasts changes via `broadcast(event, data)`.

### Data model highlights

36 models in `prisma/schema.prisma` (1004 lines). Key relationships:
- **Restaurant** is the tenant root. Nearly every model has `restaurantId`.
- **Bill** has a unique constraint on `(restaurantId, billNumber)` and another on `(restaurantId, fiscalYear, sequence)` for the unbroken serial requirement.
- **Order** → **Bill** is many-to-one: a table's second round joins the open bill instead of opening a new one.
- **Space** (table spaces / floors) is per-restaurant, fully custom. `RestaurantTable.space` is free text, not a foreign key, so renaming a space bulk-updates every table's `space` string in one transaction.
- **InvoiceSetting**, **KotSetting**, **RestaurantSetting** are 1-to-1 with Restaurant for per-outlet print and operational config.

### Image uploads

`lib/upload.ts` writes to `public/uploads/{folder}/{filename}` on the local filesystem, then calls `addToLibrary()` which appends to a JSON index at `public/uploads/_library.json`.

Both are ephemeral on Vercel/Netlify: the directory is wiped on every deploy and is not shared between serverless instances. The `cloudinary` package is installed but is not imported anywhere yet. Moving the library index to a DB table is tracked as a known gap in the header comment of `lib/actions/image-library.ts`.

All three exports of `image-library.ts` are Server Actions (public POST endpoints) and now require a signed-in tenant via `requireTenant()`.

### Component structure

- `components/ui/` — 47 shadcn/ui primitives
- `components/shared/` — 25 cross-portal components (navbar, hero, modals, page skeletons)
- `components/dashboard/` — 11 owner/reception dashboard widgets
- `components/menu-book/` — 17 components for the guest-facing menu (adapted from TanStack patterns)
- `components/settings/`, `components/receipt/`, `components/kot/` — feature-specific

### Key libraries

- **next 16.2.10** (App Router, React Server Components, Server Actions)
- **prisma 5.22.0** + `@prisma/client`
- **jose** for JWT (HS256, 7-day expiry)
- **bcryptjs** for password hashing
- **zod** + **react-hook-form** + **@hookform/resolvers** for forms
- **@tanstack/react-query** (60s stale time, no refetch on window focus, aggregates cached 5min)
- **@tanstack/react-table** for data tables
- **date-fns** for date math, **nepali-date-converter** for BS ↔ AD
- **qrcode** + **react-qr-code** for table QR generation
- **recharts** for charts
- **framer-motion** for animations
- **sonner** for toasts
- **cloudinary** — installed but currently unused (see Image uploads)
- **lucide-react** for icons

### Environment variables

See `.env.example`:
- `DATABASE_URL` — Neon Postgres pooler connection (for runtime, uses pgbouncer)
- `DIRECT_URL` — direct connection for migrations (port 5432)
- `JWT_SECRET` — HMAC key for session tokens
- `PAYMENT_WEBHOOK_SECRET` — verify `x-webhook-signature` on `/api/webhooks/payment`
- `NEXT_PUBLIC_APP_URL` — public origin for table QR codes (no trailing slash)
- Supabase vars present but Prisma is the active ORM

### Gotchas

**Prisma "URL must start with prisma://" (P6001):** If every DB query fails with that error, the generated client in `node_modules/.prisma/client` was built in no-engine/Accelerate mode. Fix: `npx prisma generate`, then restart dev server.

**`npm run build` fails with `EPERM` on Windows:** `prisma generate` cannot rename `query_engine-windows.dll.node` while a `npm run dev` server holds a handle on it. This is a file lock, not a code error. To verify a build without stopping the dev server, run `npx next build` directly — the engine on disk is already generated. Stop stray node processes before a real deploy so the regenerate runs. Note `next build` also refuses to finish unless `JWT_SECRET` is set; that guard is deliberate (`lib/auth.ts`), so pass a throwaway value for a local build check.

**Table QR token rotation:** Each table has a `qrCode` column (12 url-safe chars, generated by `newTableToken()` from `lib/table-token.ts`). The QR sticker encodes `/r/{restaurantId}/t/{tableId}?k={qrCode}`. The token is rotated the moment the table is released after checkout (in `lib/actions/orders.ts` and `lib/actions/public-order.ts`), silently invalidating every link handed out to the previous guests.

**Session cookie names:** Never read `session` directly; use `getSession(portal?)` from `lib/auth.ts`. It auto-detects the portal from `x-pathname` (stamped by proxy.ts) and reads the correct cookie. Outside any portal (home page, `/login`) it falls back to the first valid session in priority order.

**Component exclusions:** `tsconfig.json` excludes `lovable/` (legacy scaffolding) and `components/menu/` (original TanStack menu app superseded by `components/menu-book/`).

### Security headers

`next.config.js` applies HSTS, CSP (`frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. All static, zero per-request cost.

### Deployment targets

- `vercel.json` configured for Vercel
- `netlify.toml` + `@netlify/plugin-nextjs` for Netlify
- Both point to `next build` output

### File conventions

- Server Actions: `"use server"` at the top, discriminated-union returns (`{ data } | { error }`)
- Client Components: `"use client"` directive when using hooks, context, or browser APIs
- Page skeletons: `<Suspense fallback={<PageSkeleton />}>` in layouts for streaming
- Activity logging: most mutating actions call `logActivity(session, { actionType, entityType, entityId, description })`

### Printing

`lib/printing.ts` renders fixed-width thermal receipts (46 chars, 80mm roll in Courier). `InvoicePrintSettings` is declared structurally rather than importing the Prisma type, so the module stays usable on the client where the generated client is unavailable.

Exports: `formatReceiptHTML`, `formatOrderSlipHTML`, `formatKOTHTML` build the documents; `printReceipt` / `downloadReceipt` / `downloadReceiptPdf` handle output; `generateESCPOS` targets thermal printers directly; `extractReceiptText` and `buildTextPdf` support the PDF path.

### Where to add features

- New dashboard pages: `app/owner/{feature}/page.tsx` and `app/reception/{feature}/page.tsx` if shared
- New actions: `lib/actions/{feature}.ts`, always call `requireTenant()` or `requireUser()` first
- New billing rules: update `bill-design.md` first, then `lib/billing/calculate.ts`
- New settings: add to `InvoiceSetting`, `KotSetting`, or `RestaurantSetting` model and expose in `app/owner/settings/` or `app/reception/settings/`
