# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev              # Next.js dev server with Turbopack (port 3000)
npm run build            # Production build (runs prisma generate first)
npm run typecheck        # TypeScript type checking — currently passes clean
npm run lint             # ESLint 9 flat config (eslint.config.mjs) — 0 errors, warnings tolerated
npm run lint:fix         # ESLint with --fix
```

**Lint is fixed and green.** Two things were needed, both done:
1. The `lint` script was repointed from the removed `next lint` to `eslint .` (`eslint.config.mjs` is the flat config: `eslint-config-next/core-web-vitals` + `/typescript`, ignoring `.next`, `out`, `public/uploads`, `lovable/`, `components/menu/`).
2. `zod` was bumped from `3.23.8` to `^3.25.0` — the installed `eslint-plugin-react-hooks` v7 requires the `zod/v4/core` export, which zod only provides from 3.25. The v3 API is unchanged, so app code is unaffected.

Two deliberate relaxations in `eslint.config.mjs`: `@typescript-eslint/no-explicit-any` is **off** (server actions and Prisma payloads are loosely typed by design; `tsc --noEmit` is the type gate), and the react-hooks v7 React-Compiler-era rules (`set-state-in-effect`, `purity`, `refs`, `immutability`) are **off** because the codebase predates the compiler migration — effects that seed state from stores, polls and device APIs are deliberate patterns. Re-enable them when the app moves to React Compiler.

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
npm run verify:contrast  # WCAG contrast audit of the token layer — 87/87 pairs pass
```

These are the two automated suites in the repo. There are no `.test.*` / `.spec.*` files and no vitest, jest, or playwright config anywhere.

`verify:billing` asserts the `lib/billing/` engine against the worked examples in `bill-design.md`: both pricing modes, discount-before-VAT, Schedule 1 exempt handling, float-drift resistance, abbreviated-invoice and buyer-PAN thresholds, the digital rebate, and NPR amount-in-words (including lakh/crore). It also pins the discounted ADDITIVE total against the discounted INCLUSIVE one, which is the regression guard for the hand-rolled-total bug described under IRD billing below.

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

Older actions still guard with the weaker `getSession()` + `if (!session?.restaurantId)` idiom instead of `requireTenant()`. That check proves only that *a* tenant session exists — it performs no role check, and on its own it does not tie the record to the caller's outlet. **The `restaurantId` must still appear in the `where` clause**, which is why every lookup in `lib/actions/bills.ts` reads `findFirst({ where: { id, restaurantId: session.restaurantId } })` rather than `findUnique({ where: { id } })`. `recordPayment` was the one exception and could settle any bill on the platform from its id alone; a Server Action is a public POST endpoint, so the `where` clause was the only control. When touching one of these, note that narrowing on `session` does not survive into a `$transaction` callback — hoist `const restaurantId = session.restaurantId` above the transaction.

**Never mint a session from an argument.** `createSession` picks the portal cookie from the `role` on the database row it is handed, so any action that resolves an account from caller-supplied input and then calls it is an unauthenticated session mint for *any* account, superadmin included — and every `"use server"` export is a public POST endpoint whether or not the app calls it. Three actions did this and have been fixed:

- `createSessionFromSupabaseLogin` took an **email**, found-or-created that user, and signed them in. It was dead code from the abandoned Supabase path (Prisma is the active ORM; the Supabase env vars are vestigial), so it was **deleted** — an unused endpoint is not secured by being unused.
- `completeGoogleRegistration` and `sessionForExistingGoogleUser` took a `userId` from client state, because Google sign-up is two round trips and no session cookie exists between them.

Since there is no session to derive from mid-signup, those two now take a **short-lived signed ticket** (`lib/google-ticket.ts`) minted by `googleLogin` at the one point where the Google credential is actually verified, and read the account id out of the verified payload. The ticket is signed with a key **derived** from `JWT_SECRET` (HMAC under a fixed label), not `JWT_SECRET` itself, so a ticket cannot be replayed as a session cookie or vice versa — that matters because a ticket carries no `role` and `portalForRole(undefined)` falls through to the owner portal. It carries only a subject, a purpose and a 15-minute expiry; role, `restaurantId` and every activity check are re-read from the database by the consuming action, so a ticket cannot carry stale privileges. Anything else needing a pre-session handoff should use the same pattern rather than trusting an id.

Both Google actions also re-check `isActive` and the restaurant kill switch at consume time, and `googleLogin` now applies the same gates the password path does: admins are refused (they sign in through the superadmin console only, matching `login()`'s `blockAdmin`), deactivated accounts are refused, and an owner whose restaurant the superadmin has closed is refused. `googleLogin`'s access-token branch additionally verifies the token's **audience** via Google's tokeninfo endpoint — the `userinfo` lookup alone proves the token is a valid Google token for that email, not that it was issued to *this* app, so without it any other Google OAuth app could sign in as its own users here (`openid email profile` is the scope they all request). The `id_token` branch gets this from `verifyIdToken({ audience })`.

**`lib/actions/settings.ts` was the last module still on the pre-`requireTenant` pattern**, and it had ten instances of it: every export took the target `restaurantId` as its first argument behind a bare `if (!session)`. Since a restaurant id is public (it is printed on every table QR sticker), any signed-in user of any outlet — a waiter included — could read and rewrite another restaurant's PAN, VAT number, tax rate, operating hours, cover photo, settings blob and subscription. `updateRestaurant` also logged the change against the *caller's* `session.restaurantId` while writing to the supplied id, so the audit trail named the wrong outlet. All ten now derive the id from `requireTenant()`, at `OWNER_ROLES` for the writes and `ALL_TENANT_ROLES`/`FRONT_OF_HOUSE_ROLES` for the reads. Each keeps a vestigial leading `_restaurantId` parameter so existing call sites compile — they all passed their own session's restaurant anyway. `getAvailablePlans` legitimately stays on `getSession()`: it reads the public plan catalogue and touches no tenant data. The superadmin console is unaffected; it edits arbitrary outlets through the separate `updateRestaurant` in `lib/actions/admin.ts` behind `requireAdmin()`.

`updateRestaurantDirect` was **deleted** from that file. It interpolated the *keys* of a caller-supplied object into an `UPDATE restaurants SET ...` string and ran it through `$executeRawUnsafe` — values were parameterised, column names were not, and there was no allowlist, so a key was arbitrary SQL. It had no call sites. `updateRestaurant` covers the job safely (session-derived id, fixed column allowlist, query builder); extend that allowlist rather than reviving a raw statement.

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
- `lines.ts` — turns an order's rows into engine lines, falling back to one aggregate line when the stored `subtotal` disagrees with its items (live data has orders whose items were all cancelled while `subtotal` kept its original value).

**Every path that touches a money column goes through `calculateBill`.** Not one of them may do the arithmetic itself, and `subtotal + serviceCharge - discount` is the specific trap: that is the grand total in INCLUSIVE mode only, so in ADDITIVE mode it silently drops the VAT stacked on top and undercharges by the whole tax. Three callers had it — `applyDiscountToBill` and `applyCouponToBill` in `lib/actions/bills.ts`, and the reception checkout screen, which additionally carved VAT out at a hardcoded 13 and so quoted the guest a total the server then disagreed with. All three now call the engine with the outlet's own mode and rate; `verify:billing` pins the two modes against each other so a regression fails the suite rather than the audit. A discount recalculation reads `pricingMode` **from the bill**, never from the restaurant's current setting: flipping the outlet's mode must not reinterpret a ticket already open.

`lib/vat.ts` (an inclusive-only `splitVatInclusive` at a hardcoded `NEPAL_VAT_RATE = 13`) was the pre-engine implementation and has been deleted. Nothing should reintroduce a second VAT calculation.

**Race-free invoice numbering:** `lib/actions/billing.ts` allocates the sequence inside a transaction and relies on the `@@unique([restaurantId, fiscalYear, sequence])` constraint to prevent duplicate tax-invoice numbers under concurrent checkouts. A P2002 unique violation triggers a retry (max 5 attempts). Voided bills keep their sequence and are marked VOID rather than deleted (IRD audit trail requirement).

**Bill model columns:** The schema carries every IRD-mandated field: `fiscalYear`, `sequence`, `billDateBS`, `pricingMode`, `isAbbreviated`, `exemptAmount`, `buyerName`, `buyerPan`, `buyerAddress`, `cbmsStatus`, `cbmsSyncedAt`, `voidReason`. CBMS sync is queued (`PENDING` status) and never blocks closing a ticket.

**Editing `bill-design.md` has house rules** (stated in its own section 2): no em/en dashes, no emoji, and — the one that constrains code — **no hardcoded rates or thresholds**. Every VAT rate, service-charge percent, PAN threshold, and CBMS turnover figure must be a named config value, because Nepal's Finance Act revises them most fiscal years (effective Shrawan 1) and a literal means a code release each time. Where sources genuinely conflict, the spec marks the value "Unconfirmed" and it must stay configurable rather than being silently settled; `config.ts` carries those markers through in comments.

### Real-time sync — wired but inert

`lib/sync.ts` exports the client half of an SSE + BroadcastChannel design, and the transport works: `startSync()` opens `/api/sync/events`, the route sends `{type:"connected"}` then a `{type:"heartbeat"}` every 15s and cleans up on disconnect, and the client reconnects after 5s on error. `app/owner/shell.tsx` and `app/reception/shell.tsx` call `startSync()`/`stopSync()` on mount.

**Nothing rides on it yet.** `broadcast()` and `onSyncEvent()` have zero call sites, so no listener is ever registered and no domain event is ever published. Do not assume a change made in one portal reaches another: every view still refreshes by refetching. Two structural gaps to know before building on this:

- The SSE route has **no publish path**. It can only emit its own heartbeat; there is no way for a Server Action to push an event into an open connection. Adding one needs server-side pub/sub, and the app is serverless, so an in-memory fan-out does not reach the instance holding the client's connection.
- `broadcast()` posts **only** to BroadcastChannel, which is same-origin *same-browser*. It cannot carry an event to another device, which is the actual restaurant case (till on a desktop, kitchen on a tablet).

The route also performs no auth, so any anonymous client can hold an open connection with a server-side 15s interval behind it.

### Data model highlights

36 models in `prisma/schema.prisma` (1004 lines). Key relationships:
- **Restaurant** is the tenant root. Nearly every model has `restaurantId`.
- **Bill** has a unique constraint on `(restaurantId, billNumber)` and another on `(restaurantId, fiscalYear, sequence)` for the unbroken serial requirement.
- **Order** → **Bill** is many-to-one: a table's second round joins the open bill instead of opening a new one.
- **Space** (table spaces / floors) is per-restaurant, fully custom. `RestaurantTable.space` is free text, not a foreign key, so renaming a space bulk-updates every table's `space` string in one transaction.
- **InvoiceSetting**, **KotSetting**, **RestaurantSetting** are 1-to-1 with Restaurant for per-outlet print and operational config.

### Image uploads

`lib/upload.ts` writes to `public/uploads/{folder}/{filename}` on the local filesystem, then calls `addToLibrary()` which appends to a JSON index at `public/uploads/_library.json`.

`uploadFile(file, folder, kind)` is the only entry point and returns `{ url } | { error }`, so a rejection reaches the toast instead of a flat "upload failed". It is a Server Action, therefore a public POST endpoint, and gates on `requireUser()` — not `requireTenant()`, because the superadmin Owner Management console uploads owner KYC files and platform admins carry no `restaurantId`.

Three things the writer enforces beyond auth:
- **Folder allowlist.** `folder` arrives from client components and is interpolated into a filesystem path, so only the named folders are accepted; `../../lib/actions` is not one of them.
- **Random filename suffix.** Two staff photos both named `img_0001.jpg` used to resolve to the same path and silently overwrite each other, across tenants, since the path carries no restaurant id.
- **`deleteImage` is confined to the upload tree.** `publicId` was joined onto `public/` unchecked.

`lib/upload-limits.ts` holds the size cap, the extension allowlists, the `accept` strings, and `validateUpload()`. It is deliberately *not* a `"use server"` module: the client pickers import it to reject a file before a multi-megabyte body goes over the wire, and `uploadFile` imports the same values as the authoritative gate, so the label the user reads cannot drift from the rule enforced. SVG is excluded on purpose — uploads are served from the app's own origin and an SVG is the one image format that is also a scriptable document. `kind: 'document'` additionally accepts PDF, which is what the staff and owner KYC slots use.

`components/shared/upload-field.tsx` (`UploadField`) is the shared picker: it uploads on pick and hands the parent a URL rather than a `File`, which is what lets it drop into an edit form where an untouched field keeps the stored URL. Pickers that cannot take its shape (the superadmin console's inline avatar button and its 16:10 document pair) keep their own markup but import the same rules from `upload-limits.ts`.

Both the uploads directory and the library index are ephemeral on Vercel/Netlify: the directory is wiped on every deploy and is not shared between serverless instances. The `cloudinary` package is installed but is not imported anywhere yet. Moving the library index to a DB table is tracked as a known gap in the header comment of `lib/actions/image-library.ts`.

All three exports of `image-library.ts` are Server Actions (public POST endpoints) and now require a signed-in tenant via `requireTenant()`.

### Deleting a tenant

`lib/restaurant-purge.ts` returns the foreign-key-ordered list of deletes for one restaurant, for the caller to hand straight to `prisma.$transaction([...])`. No relation in the schema declares `onDelete: Cascade` except `TicketReply -> SupportTicket`, so Prisma emits `ON DELETE RESTRICT` and a single missed child table turns the whole delete into a foreign-key error. The list is derived from the `Restaurant` model's own relation block so it stays checkable against the schema.

Like `lib/auth-tenant.ts` it is a plain module, not `"use server"` — it carries no authorization of its own and is imported by the two actions that do: `deleteRestaurant` in `lib/actions/admin.ts` behind `requireAdmin()`, and `deleteMyRestaurant` in `lib/actions/settings.ts` behind `requireTenant(["RESTAURANT_OWNER"])`. The owner-facing path is gated to `RESTAURANT_OWNER` alone rather than `OWNER_ROLES` (legacy STAFF logins also live in the owner portal), demands a typed confirmation phrase server side, and **refuses once any bill exists** — IRD retention is why the billing engine voids bills instead of deleting them, so those outlets go through support. It also clears the owner, reception, and waiter cookies, since the JWTs would still verify against a restaurant that no longer exists.

### Component structure

- `components/ui/` — 47 shadcn/ui primitives
- `components/shared/` — 28 cross-portal components (navbar, hero, modals, page skeletons, `UploadField`)
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
- New model hanging off `Restaurant`: add a matching line to `lib/restaurant-purge.ts`, or both delete paths break on a foreign key
- New file picker: render `UploadField` from `components/shared/upload-field.tsx`, and take limits from `lib/upload-limits.ts` rather than restating them
