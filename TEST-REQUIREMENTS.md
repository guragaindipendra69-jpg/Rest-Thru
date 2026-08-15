# RESTHRU - Test Requirements Specification

Document version: 1.0
Date: 2026-08-11
System under test: RESTHRU restaurant management system (Next.js 16 App Router, Prisma, Postgres)
Status: Baseline for first full test cycle

---

## 1. Purpose and Scope

### 1.1 Purpose

This document defines what must be verified before RESTHRU is considered fit for production use by a paying restaurant. It states functional requirements (what the system must do), non-functional requirements (how well it must do it), and the supporting requirements that are neither (data, compliance, environment, documentation, exit criteria).

Every requirement in this document is written to be testable: it names an actor, an action, and an observable outcome.

### 1.2 In scope

- Four portals: superadmin console, owner dashboard, reception/cashier station, waiter station
- Guest-facing QR menu and self-ordering flow (`/r/{restaurantId}/t/{tableId}`)
- Order lifecycle, KOT printing, billing, IRD Nepal tax invoicing
- Subscription plans, feature gating, resource caps
- Multi-tenant data isolation
- Marketing and public pages (home, pricing, contact, legal)

### 1.3 Out of scope for this cycle

| Area | Reason |
| --- | --- |
| CBMS live sync to IRD servers | Queued as `PENDING` only; no live integration exists yet |
| Cloudinary / durable image hosting | Package installed but never imported; uploads are local filesystem only |
| Real payment gateway settlement (eSewa, Khalti, Fonepay) | Only the webhook receiver and method labels exist |
| Native mobile apps | Not built |
| `lovable/` and `components/menu/` | Excluded in `tsconfig.json`; legacy scaffolding |

---

## 2. System Overview for Testers

### 2.1 Portals and their entry points

| Portal | Route prefix | Session cookie | Roles permitted |
| --- | --- | --- | --- |
| Superadmin console | `/superadmin` | `session_admin` | SUPERADMIN |
| Owner dashboard | `/owner` | `session_owner` | RESTAURANT_OWNER, STAFF |
| Reception / cashier | `/reception` | `session_reception` | RESTAURANT_OWNER, STAFF, RECEPTIONIST |
| Waiter station | `/order` | `session_waiter` | WAITER (plus all tenant roles) |
| Guest menu | `/r/{restaurantId}/t/{tableId}?k={token}` | none (public) | anonymous guest |

The four cookies are independent by design. One browser must be able to hold all four sessions at once, and logging out of one must not disturb the others. This is itself a test requirement (FR-AUTH-070).

### 2.2 Role sets (from `lib/auth-tenant.ts`)

- `OWNER_ROLES` = RESTAURANT_OWNER, STAFF
- `FRONT_OF_HOUSE_ROLES` = RESTAURANT_OWNER, STAFF, RECEPTIONIST
- `ALL_TENANT_ROLES` = RESTAURANT_OWNER, STAFF, RECEPTIONIST, WAITER

### 2.3 Order state machine (from `lib/actions/orders.ts`)

```
PENDING  -> PREPARING, CANCELLED
PREPARING -> READY, CANCELLED, PENDING   (PENDING = kitchen undo)
READY     -> SERVED, PREPARING           (PREPARING = kitchen undo)
SERVED    -> (terminal)
CANCELLED -> (terminal)
```

Every transition not listed above must be rejected. This is the single most important state-machine test surface in the system.

### 2.4 Plan caps (from `lib/plan-limits.ts`)

| Plan | Tables | Staff | Menu items | Restaurants |
| --- | --- | --- | --- | --- |
| FREE | 5 | 10 | 30 | 1 |
| BASIC | 20 | 10 | 50 | 1 |
| PRO | 50 | 50 | 200 | 3 |
| ENTERPRISE | unlimited | unlimited | unlimited | unlimited |

Feature flags: THERMAL_PRINTER, ORDER_TRACKING, STAFF_MANAGEMENT, VAT_BILLING, REALTIME_ANALYTICS, MULTI_BRANCH, MULTIPLE_PAYMENTS, API_ACCESS.

A restaurant with no active subscription resolves to FREE, the most restrictive tier.

---

## 3. Test Environment Requirements

### 3.1 Required environment variables

| Variable | Purpose | Notes for test setup |
| --- | --- | --- |
| `DATABASE_URL` | Neon Postgres pooler (pgbouncer) | Use a dedicated test database, never production |
| `DIRECT_URL` | Direct connection, port 5432 | Required for migrations |
| `JWT_SECRET` | HMAC key for session tokens | `next build` refuses to finish without it; a throwaway value is fine for local builds |
| `PAYMENT_WEBHOOK_SECRET` | Verifies `x-webhook-signature` | Needed for webhook tests (FR-PAY-040) |
| `NEXT_PUBLIC_APP_URL` | Public origin encoded into table QR codes | Must have no trailing slash, or QR URLs break |
| Supabase vars | Present in `.env.example` but Prisma is the active ORM | Not required for test runs |

### 3.2 Setup sequence

```bash
npm install
npx prisma generate
npm run db:push        # or db:migrate:deploy against a clean test DB
npm run db:seed
npm run dev            # port 3000, Turbopack
```

### 3.3 Static analysis and existing automated suites

| Command | What it covers | Current state |
| --- | --- | --- |
| `npm run typecheck` | Full TypeScript check | Passes clean. This is the static-analysis gate |
| `npm run verify:billing` | Bill engine against `bill-design.md` worked examples | All checks pass |
| `npm run verify:contrast` | 87 WCAG foreground/background pairs with alpha compositing | 87/87 pass |
| `npm run lint` | ESLint 9 flat config (`eslint.config.mjs`) | 0 errors; warnings tolerated. Restored: `next lint` removed in Next 16, so the script was repointed at `eslint` and `zod` bumped to `^3.25.0` (react-hooks v7 needs the `zod/v4/core` export) |

There are no `.test.*` or `.spec.*` files and no vitest, jest, or playwright configuration in the repository. Everything in sections 4 and 5 below is currently a manual or to-be-automated requirement. Establishing an automated harness is itself listed as a gap in section 9.

### 3.4 Environment gotchas that will waste tester time

1. **Prisma P6001 "URL must start with prisma://"** - the generated client was built in no-engine/Accelerate mode. Run `npx prisma generate`, then restart the dev server.
2. **`npm run build` fails with EPERM on Windows** - `prisma generate` cannot rename `query_engine-windows.dll.node` while a dev server holds the handle. Run `npx next build` directly, or stop stray node processes.
3. **Server action IDs are unstable under Turbopack dev** - the on-disk manifest goes stale. Recover live action IDs per the verify skill (`.claude/skills/verify/SKILL.md`) before driving actions via curl.

---

## 4. Functional Requirements

Requirement ID format: `FR-<MODULE>-<NNN>`. Priority: P1 (must pass to ship), P2 (should pass), P3 (nice to have).

### 4.1 Authentication and session management (AUTH)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-AUTH-010 | A user with valid credentials can sign in at `/owner/login`, `/reception/order/login`, `/superadmin/login`, and `/order/login`, and lands on that portal's home page. | P1 |
| FR-AUTH-020 | Invalid credentials return a generic failure that does not reveal whether the email exists. | P1 |
| FR-AUTH-030 | Passwords are stored bcrypt-hashed; no plaintext or reversible value appears in the database or in any log. | P1 |
| FR-AUTH-040 | Session JWTs are HS256, signed with `JWT_SECRET`, and expire after 7 days. An expired token redirects to login. | P1 |
| FR-AUTH-050 | A tampered or re-signed JWT (wrong secret, altered `restaurantId`, altered role) is rejected by both `proxy.ts` and `guardArea()`. | P1 |
| FR-AUTH-060 | A session valid for one portal cannot access another portal. An owner token presented at `/superadmin` redirects to the superadmin login. | P1 |
| FR-AUTH-070 | All four sessions coexist in one browser. Logging out of any one portal leaves the other three sessions intact and usable. | P1 |
| FR-AUTH-080 | Requests that bypass middleware still cannot render authenticated content, because the layout-level `guardArea()` repeats the check. | P1 |
| FR-AUTH-090 | Password reset via `/owner/forgot-password` and `/owner/password-reset` issues a single-use, time-limited token; a reused or expired token fails. | P1 |
| FR-AUTH-100 | Google sign-in (`lib/actions/google-auth.ts`) creates or links an account without creating a duplicate user for an existing email. | P2 |
| FR-AUTH-110 | On the home page and `/login`, outside any portal, `getSession()` falls back to the first valid session in priority order and never reads a bare `session` cookie. | P2 |

### 4.2 Multi-tenant isolation (TEN)

This is the highest-risk area in the system, because every table QR sticker prints a `restaurantId` in plain sight.

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-TEN-010 | Every server action in `lib/actions/*` that touches restaurant data calls `requireTenant()` before any query. | P1 |
| FR-TEN-020 | `restaurantId` is always taken from the session and never from a caller-supplied parameter. | P1 |
| FR-TEN-030 | A signed-in user of restaurant A who submits restaurant B's public `restaurantId` to any action receives an authorization error and no data from B. Test this against every exported action, not a sample. | P1 |
| FR-TEN-040 | Role escalation is blocked: a WAITER session cannot invoke an action restricted to `OWNER_ROLES`, and a RECEPTIONIST cannot invoke owner-only actions. | P1 |
| FR-TEN-050 | All three exports of `lib/actions/image-library.ts` require a signed-in tenant. Unauthenticated POSTs are rejected. | P1 |
| FR-TEN-060 | Cross-tenant reads through relational includes (for example, ordering a menu item belonging to another restaurant) are rejected, not silently joined. | P1 |

### 4.3 Restaurant, space, and table management (TBL)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-TBL-010 | An owner can create, rename, and delete a table; a table in use cannot be deleted without an explicit confirmation path. | P1 |
| FR-TBL-020 | Creating a table beyond the plan cap returns `{ error, limitReached }` and the UI renders an upgrade prompt rather than a generic error. | P1 |
| FR-TBL-030 | Table status transitions AVAILABLE to OCCUPIED when an order opens, and back to AVAILABLE when the table is released after checkout. | P1 |
| FR-TBL-040 | `Space` is free text on `RestaurantTable`, not a foreign key. Renaming a space bulk-updates every affected table's `space` string inside one transaction; a partial rename must not be observable. | P1 |
| FR-TBL-050 | Each table carries a 12-character url-safe `qrCode` token from `newTableToken()`. | P1 |
| FR-TBL-060 | The QR sticker encodes `/r/{restaurantId}/t/{tableId}?k={qrCode}` using `NEXT_PUBLIC_APP_URL` as the origin. | P1 |
| FR-TBL-070 | **Token rotation:** the moment a table is released after checkout, its `qrCode` is rotated in both `lib/actions/orders.ts` and `lib/actions/public-order.ts`. Every previously handed-out link is silently invalidated and returns an error, not the menu. | P1 |
| FR-TBL-080 | QR codes can be viewed and printed in bulk from `/owner/tables/qr` and `/reception/tables/qr`. | P2 |
| FR-TBL-090 | Operating hours can be set per restaurant and are reflected where the guest menu shows open/closed state. | P2 |

### 4.4 Menu management (MENU)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-MENU-010 | Owner and reception can create, edit, reorder, and soft-delete categories, dishes, and combos. | P1 |
| FR-MENU-020 | Creating a menu item beyond the plan cap is blocked with an upgrade prompt. | P1 |
| FR-MENU-030 | A dish supports price, description, image, availability toggle, and add-ons; an unavailable dish is not orderable from the guest menu. | P1 |
| FR-MENU-040 | Combos price and display correctly, and their component items resolve on the order and the bill. | P1 |
| FR-MENU-050 | A menu item flagged VAT-exempt (Schedule 1) is carried through to the bill as `exemptAmount` and is excluded from the taxable base. | P1 |
| FR-MENU-060 | Image upload writes to `public/uploads/{folder}/{filename}` and appends to `public/uploads/_library.json`. | P2 |
| FR-MENU-070 | Soft-deleted items appear in Trash (`/owner/settings/trash`) and can be restored. | P2 |
| FR-MENU-080 | The guest-facing menu book renders categories, search, and item detail correctly on a phone viewport. | P1 |

### 4.5 Ordering (ORD)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-ORD-010 | A guest scanning a valid table QR reaches the menu and can place an order without signing in. | P1 |
| FR-ORD-020 | A guest presenting a rotated, malformed, or missing `k` token cannot place an order. | P1 |
| FR-ORD-030 | Staff can create an order from the waiter station, reception, and owner portals against any table. | P1 |
| FR-ORD-040 | **Second round joins the open bill.** A table's subsequent order attaches to the existing open `Bill` rather than opening a new one (Order to Bill is many-to-one). | P1 |
| FR-ORD-050 | Order status transitions follow the state machine in section 2.3 exactly. Every illegal transition is rejected with an error and leaves state unchanged. | P1 |
| FR-ORD-060 | Kitchen undo works: PREPARING can return to PENDING, and READY can return to PREPARING. | P1 |
| FR-ORD-070 | CANCELLED is reachable only from PENDING or PREPARING, never from READY or SERVED. | P1 |
| FR-ORD-080 | `voidOrderItem` and `voidOrder` remove the item or order from the payable total, record who did it and why, and write an activity log entry. | P1 |
| FR-ORD-090 | A guest can request table service and request the bill from the guest menu, and the request surfaces to reception. | P2 |
| FR-ORD-100 | `getPublicOrderStatus` lets a guest track their order without exposing any other order's data. | P1 |
| FR-ORD-110 | Order item quantity, notes, and add-on selections persist through to the KOT and the bill. | P1 |
| FR-ORD-120 | Two staff editing the same open order concurrently do not lose one another's items. | P2 |

### 4.6 KOT and printing (PRT)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-PRT-010 | A new order generates a KOT via `formatKOTHTML`, honouring the restaurant's `KotSetting`. | P1 |
| FR-PRT-020 | Receipts render fixed-width at 46 characters for an 80mm roll in Courier (`lib/printing.ts`). Long item names wrap without breaking column alignment. | P1 |
| FR-PRT-030 | `printReceipt`, `downloadReceipt`, and `downloadReceiptPdf` each produce output matching the on-screen bill. | P1 |
| FR-PRT-040 | `generateESCPOS` emits valid ESC/POS for a thermal printer. | P2 |
| FR-PRT-050 | THERMAL_PRINTER is gated: a FREE-plan restaurant cannot reach thermal printing. | P1 |
| FR-PRT-060 | `InvoicePrintSettings` is declared structurally, so `lib/printing.ts` imports cleanly in a client component where the generated Prisma client is unavailable. | P2 |
| FR-PRT-070 | Order slips (`formatOrderSlipHTML`) print separately from KOTs and receipts. | P2 |

### 4.7 Billing and IRD compliance (BILL)

`bill-design.md` is the specification of record. Any conflict between this section and that file is resolved in favour of `bill-design.md`.

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-BILL-010 | INCLUSIVE mode treats the menu price as final and back-calculates VAT. | P1 |
| FR-BILL-020 | ADDITIVE mode treats the menu price as a pre-VAT base and stacks service charge then VAT on top. | P1 |
| FR-BILL-030 | Discount is applied before VAT, never after. | P1 |
| FR-BILL-040 | Schedule 1 exempt items are excluded from the taxable base and reported in `exemptAmount`. | P1 |
| FR-BILL-050 | All intermediate sums run through paisa (integer minor units). A long bill of many odd-priced items shows no float drift; rounding happens exactly once, at the total. | P1 |
| FR-BILL-060 | A bill at or above `abbreviatedInvoiceThreshold` (default 10,000) cannot be issued as an abbreviated invoice. | P1 |
| FR-BILL-070 | A bill at or above `buyerPanThreshold` (default 10,000, marked UNCONFIRMED in config) requires buyer name, PAN, and address. | P1 |
| FR-BILL-080 | The digital payment VAT rebate applies `digitalVatRebatePercent` (default 10) of the VAT amount, not of the bill total. | P1 |
| FR-BILL-090 | `amount-in-words.ts` renders the NPR grand total in words and switches to lakh past 99,999 and to crore above that. | P1 |
| FR-BILL-100 | Fiscal year is derived correctly (Shrawan 1 to Asar end) and `billDateBS` is a valid BS date. | P1 |
| FR-BILL-110 | **Race-free numbering.** Concurrent checkouts never produce duplicate tax-invoice numbers. The sequence is allocated inside a transaction; the `@@unique([restaurantId, fiscalYear, sequence])` constraint enforces it; a P2002 violation retries up to 5 times. Test with parallel checkout requests, not sequential ones. | P1 |
| FR-BILL-120 | The invoice sequence is unbroken. Gaps must not appear even after voids or failed attempts. | P1 |
| FR-BILL-130 | A voided bill keeps its sequence, is marked VOID with a `voidReason`, and is never deleted (IRD audit trail). | P1 |
| FR-BILL-140 | `issueCreditNote` produces a correctly linked credit note against the original bill. | P1 |
| FR-BILL-150 | CBMS sync is queued as `cbmsStatus = PENDING` and never blocks closing a ticket. A CBMS failure leaves the bill issued and the ticket closed. | P1 |
| FR-BILL-160 | **No hardcoded rates.** Every VAT rate, service-charge percent, PAN threshold, and CBMS turnover figure resolves from `lib/billing/config.ts`. Changing `vatRate` in config changes every calculation with no code edit. Grep the codebase for literal `13`, `10`, `10000` in a tax context as part of this test. | P1 |
| FR-BILL-170 | Per-outlet overrides work: `taxPercentage` and `serviceCharge` on the restaurant record override the defaults. | P1 |
| FR-BILL-180 | VAT_BILLING is plan-gated; a FREE or BASIC restaurant cannot issue a VAT invoice. | P1 |
| FR-BILL-190 | Values marked UNCONFIRMED in config (buyer PAN threshold, hospitality CBMS threshold) remain configurable and are not silently settled in code. | P2 |
| FR-BILL-200 | `npm run verify:billing` passes in full after any change to `lib/billing/`. | P1 |

### 4.8 Payments (PAY)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-PAY-010 | A bill can be settled by CASH, CARD, CREDIT, ESEWA, KHALTI, or FONEPAY, and `paymentMethod` plus `paymentRef` persist on the Bill. | P1 |
| FR-PAY-020 | Split payments across multiple methods sum to the grand total; a short or over payment is rejected or explicitly flagged. | P1 |
| FR-PAY-030 | MULTIPLE_PAYMENTS is plan-gated to PRO and above. | P1 |
| FR-PAY-040 | `/api/webhooks/payment` verifies `x-webhook-signature` against `PAYMENT_WEBHOOK_SECRET`. An unsigned or wrongly signed payload is rejected with no state change. | P1 |
| FR-PAY-050 | A replayed webhook payload does not double-credit a bill. | P1 |
| FR-PAY-060 | `amountPaid` and bill `status` stay consistent: a fully paid bill cannot remain unpaid, and a partially paid bill is not marked settled. | P1 |

### 4.9 Plans, subscriptions, and gating (PLAN)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-PLAN-010 | A restaurant with no active subscription resolves to FREE. | P1 |
| FR-PLAN-020 | Each numeric cap in section 2.4 is enforced at the boundary. Creating the Nth resource succeeds; the N+1th is blocked. | P1 |
| FR-PLAN-030 | The cap check runs on create attempts only, never on reads, and is a single indexed query. | P2 |
| FR-PLAN-040 | Every feature flag gates its feature in the UI and in the server action. Hiding a button is not sufficient; the action must also refuse. | P1 |
| FR-PLAN-050 | `UNLIMITED` (Infinity) is never serialized to the client. An ENTERPRISE tier never triggers an upgrade payload. | P1 |
| FR-PLAN-060 | Upgrading a plan lifts caps immediately without re-login. Downgrading below current usage is handled explicitly, not by silent data loss. | P1 |
| FR-PLAN-070 | The caps in `lib/plan-limits.ts` match the seeded `plans` rows in the database. | P1 |
| FR-PLAN-080 | Promo codes and coupons apply correctly and cannot be reused beyond their limit. | P2 |

### 4.10 Staff, shifts, and roles (STAFF)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-STAFF-010 | An owner can invite, edit, deactivate, and remove staff with roles STAFF, RECEPTIONIST, WAITER. | P1 |
| FR-STAFF-020 | Creating staff beyond the plan cap is blocked with an upgrade prompt. | P1 |
| FR-STAFF-030 | A deactivated staff member's existing session stops working on next request. | P1 |
| FR-STAFF-040 | Shift open, close, and cash reconciliation produce a correct shift summary. | P2 |
| FR-STAFF-050 | STAFF_MANAGEMENT is gated to BASIC and above. | P1 |

### 4.11 Reception and cashier operations (RCP)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-RCP-010 | The reception floor view shows live table status across all spaces. | P1 |
| FR-RCP-020 | Checkout at `/reception/checkout/[orderId]` shows the full ticket, applies discount, issues the bill, and releases the table. | P1 |
| FR-RCP-030 | The same checkout flow at `/owner/checkout/[orderId]` behaves identically. | P1 |
| FR-RCP-040 | Invoices list (`/reception/invoices`) filters by date, status, and fiscal year, and reprints any past bill. | P1 |
| FR-RCP-050 | CRM records customer history and links repeat customers to past bills. | P2 |
| FR-RCP-060 | Reservations and the waitlist create, seat, and cancel correctly. | P2 |
| FR-RCP-070 | Bar tabs open, accumulate, transfer between tables, and close into a bill. | P2 |

### 4.12 Owner dashboard, reports, inventory (OWN)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-OWN-010 | The dashboard KPIs (revenue, order count, average ticket) match a hand-computed figure from the same underlying bills. | P1 |
| FR-OWN-020 | Reports filter by date range and export without truncating or mis-summing rows. | P1 |
| FR-OWN-030 | Inventory items track stock, deduct on order where configured, and record `InventoryHistory`. | P2 |
| FR-OWN-040 | Low-stock and other notifications fire and can be marked read. | P2 |
| FR-OWN-050 | The activity log records actor, action type, entity type, entity ID, and description for every mutating action that calls `logActivity`. | P1 |
| FR-OWN-060 | REALTIME_ANALYTICS is gated to PRO and above. | P1 |
| FR-OWN-070 | Settings pages (invoice, KOT, tax, printer, notifications, integrations, users and roles) persist and take effect on the next print or calculation. | P1 |

### 4.13 Superadmin console (SA)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-SA-010 | Superadmin can list, view, suspend, and reactivate any restaurant. | P1 |
| FR-SA-020 | Superadmin can create and edit plans and packages, and the changes reach tenant gating. | P1 |
| FR-SA-030 | Platform analytics, financials, pipeline, health, and compliance pages load with real aggregated data, not placeholders. | P2 |
| FR-SA-040 | Support tickets and replies flow between tenant and superadmin. | P2 |
| FR-SA-050 | No tenant-role session can reach any `/superadmin` route or action. | P1 |
| FR-SA-060 | Platform settings changes apply without a redeploy. | P2 |

### 4.14 Real-time sync (SYNC)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-SYNC-010 | `startSync()` on mount opens an SSE connection to `/api/sync/events`. | P1 |
| FR-SYNC-020 | A heartbeat arrives every 15 seconds; the connection auto-cleans up on disconnect with no leaked server handle. | P1 |
| FR-SYNC-030 | An order placed in one portal appears in the kitchen and reception views without a manual refresh. | P1 |
| FR-SYNC-040 | BroadcastChannel propagates a change to every open tab of the same portal. | P1 |
| FR-SYNC-050 | A dropped connection reconnects, and no event is silently lost across the gap. | P2 |
| FR-SYNC-060 | SSE events are tenant-scoped: restaurant A never receives restaurant B's events. | P1 |

### 4.15 Public and marketing pages (PUB)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-PUB-010 | Home, pricing, about, contact, blog, careers, docs, help, API, status, privacy, terms, and cookies pages render without error. | P2 |
| FR-PUB-020 | Pricing reflects the live plan data, not a hardcoded table. | P1 |
| FR-PUB-030 | The contact form validates and delivers. | P2 |
| FR-PUB-040 | Registration at `/register` creates an owner and a restaurant on the FREE plan. | P1 |
| FR-PUB-050 | Structured data and SEO metadata are present and valid on marketing pages. | P3 |

---

## 5. Non-Functional Requirements

### 5.1 Performance (NFR-PERF)

| ID | Requirement | Target | Method |
| --- | --- | --- | --- |
| NFR-PERF-010 | Guest menu first contentful paint on a mid-range phone over 4G | under 2.5s | Lighthouse mobile, throttled |
| NFR-PERF-020 | Dashboard and floor view interactive | under 3s | Lighthouse |
| NFR-PERF-030 | Server action p95 response for order create, status update, and checkout | under 500ms | Instrumented load run |
| NFR-PERF-040 | Bill calculation for a 100-line ticket | under 100ms | `verify:billing` timing |
| NFR-PERF-050 | Concurrent checkouts sustained without duplicate invoice numbers or timeouts | 20 concurrent | Parallel curl or k6 |
| NFR-PERF-060 | SSE connections held simultaneously per instance | 100 | Soak test |
| NFR-PERF-070 | No N+1 query on list pages (orders, invoices, menu) | zero | Prisma query log inspection |
| NFR-PERF-080 | React Query cache behaves as configured: 60s stale time, no refetch on window focus, aggregates cached 5 min | as configured | Network panel |

### 5.2 Security (NFR-SEC)

| ID | Requirement |
| --- | --- |
| NFR-SEC-010 | Every export of a `"use server"` module is treated as a public POST endpoint and is authenticated. Enumerate all exports in `lib/actions/*` and confirm each one guards. |
| NFR-SEC-020 | No SQL injection is reachable; all data access goes through Prisma parameterization. |
| NFR-SEC-030 | No stored or reflected XSS in guest-supplied fields (order notes, customer name, buyer name on invoice). |
| NFR-SEC-040 | Security headers from `next.config.js` are present on every response: HSTS, CSP (`frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. |
| NFR-SEC-050 | Secrets never reach the client bundle. Grep the built output for `JWT_SECRET`, `DATABASE_URL`, and `PAYMENT_WEBHOOK_SECRET` values. |
| NFR-SEC-060 | Session cookies are HttpOnly, Secure in production, and SameSite-constrained. |
| NFR-SEC-070 | Login and password reset are rate-limited or otherwise protected against credential stuffing. **Verify whether this exists; if not, raise it as a gap.** |
| NFR-SEC-080 | File upload rejects non-image content types, oversized files, and path traversal in the filename. |
| NFR-SEC-090 | The public `restaurantId` printed on QR stickers grants no authenticated capability whatsoever. |
| NFR-SEC-100 | Error responses do not leak stack traces, table names, or Prisma error internals to the client. |
| NFR-SEC-110 | `/api/debug` is either removed or unreachable in production. **Confirm before release.** |

### 5.3 Reliability and data integrity (NFR-REL)

| ID | Requirement |
| --- | --- |
| NFR-REL-010 | Invoice numbering is transactionally safe under concurrency (see FR-BILL-110). This is a data-integrity requirement, not merely a functional one. |
| NFR-REL-020 | A failed checkout leaves no partial bill, no orphaned order-to-bill link, and no table stuck in OCCUPIED. |
| NFR-REL-030 | Every multi-write operation (space rename, checkout, void) is wrapped in a transaction and rolls back atomically. |
| NFR-REL-040 | Unique constraints hold: `(restaurantId, billNumber)` and `(restaurantId, fiscalYear, sequence)`. |
| NFR-REL-050 | A CBMS sync failure degrades gracefully: bill issued, ticket closed, status PENDING, `cbmsLastError` recorded, `cbmsAttempts` incremented. |
| NFR-REL-060 | Loss of the SSE connection degrades to a still-usable app; nothing depends on SSE for correctness. |
| NFR-REL-070 | The system recovers from a database connection blip without requiring a restart. |

### 5.4 Usability and accessibility (NFR-UX)

| ID | Requirement |
| --- | --- |
| NFR-UX-010 | `npm run verify:contrast` passes 68/68. Run it after any change to a design token, a hover state, or a `text-*/NN` class. |
| NFR-UX-020 | Contrast is checked with alpha compositing: `white/50` or `muted-foreground/70` is blended over its real backdrop, including stacked translucent surfaces such as `white/9 on sidebar-raised`. Reading class names alone is not sufficient evidence. |
| NFR-UX-030 | A failing contrast pair is investigated against what the component actually renders before any token is changed. The `brand` button variant swaps its ink to white on hover, so the resting pair is not the hovered pair. |
| NFR-UX-040 | **Elements stay visible while hovered.** No hover state may reduce an element to invisibility or near-invisibility against its surface. |
| NFR-UX-050 | Keyboard navigation reaches every interactive control, with a visible focus ring that itself passes contrast. |
| NFR-UX-060 | Screen reader labels exist on icon-only buttons, form fields, and table actions. |
| NFR-UX-070 | The guest menu is fully usable one-handed on a 360px-wide viewport. |
| NFR-UX-080 | Destructive actions (void, delete, release table) require confirmation and state what will happen. |
| NFR-UX-090 | Every server action failure surfaces a specific, human-readable message via a toast, not a silent no-op. |
| NFR-UX-100 | Loading states use the `<Suspense fallback={<PageSkeleton />}>` pattern; no page shows a blank frame while streaming. |

### 5.5 Compatibility (NFR-COMPAT)

| ID | Requirement |
| --- | --- |
| NFR-COMPAT-010 | Chrome, Edge, Safari, and Firefox current major versions on desktop. |
| NFR-COMPAT-020 | Safari on iOS and Chrome on Android for the guest menu and waiter station. |
| NFR-COMPAT-030 | Tablet layout for the reception floor view at 768px and 1024px. |
| NFR-COMPAT-040 | Thermal printing verified on at least one real 80mm ESC/POS printer, not only in the browser preview. |
| NFR-COMPAT-050 | Nepali (Devanagari) characters render correctly in the UI, in the receipt, and in the PDF. |
| NFR-COMPAT-060 | The app builds and runs on both Vercel (`vercel.json`) and Netlify (`netlify.toml` with `@netlify/plugin-nextjs`). |

### 5.6 Maintainability (NFR-MAINT)

| ID | Requirement |
| --- | --- |
| NFR-MAINT-010 | `npm run typecheck` passes clean. This is the static-analysis gate while lint is broken. |
| NFR-MAINT-020 | Linting is restored: repoint the `lint` script at `eslint` and reconcile the zod major version with what `eslint-config-next` expects. |
| NFR-MAINT-030 | Server actions return discriminated unions (`{ data } | { error }`) consistently. |
| NFR-MAINT-040 | No hardcoded tax rates, thresholds, or percentages outside `lib/billing/config.ts`. |
| NFR-MAINT-050 | An automated test harness exists (vitest or playwright) so this document's P1 items can run in CI. |

### 5.7 Compliance and legal (NFR-COMP)

| ID | Requirement |
| --- | --- |
| NFR-COMP-010 | Invoices carry every IRD-mandated field: `fiscalYear`, `sequence`, `billDateBS`, `pricingMode`, `isAbbreviated`, `exemptAmount`, `buyerName`, `buyerPan`, `buyerAddress`. |
| NFR-COMP-020 | Bill records are retained for `retentionYears` from config and are never hard-deleted. |
| NFR-COMP-030 | The audit trail is complete and immutable: voids are marked, never removed. |
| NFR-COMP-040 | Privacy, terms, and cookie pages reflect actual data handling. |
| NFR-COMP-050 | Customer personal data (CRM, buyer PAN) is not exposed to any other tenant and is included in any deletion request handling. |

---

## 6. Other Requirements

### 6.1 Test data requirements

The seed (`prisma/seed.ts`) provides a starting point, including a superadmin (`admin@resthru.com`, `admin@drillthru.tech`) and a sample restaurant (`himalayanjava.com` owner and info accounts). Beyond the seed, the following data is required and must be created before testing begins.

| Data set | Why it is needed |
| --- | --- |
| **Two independent restaurants, fully populated** | Every FR-TEN isolation test is meaningless with one tenant. Both need tables, menu, staff, and bills. |
| **One restaurant per plan tier** (FREE, BASIC, PRO, ENTERPRISE) | Cap and feature-gate tests at boundaries |
| **A restaurant sitting exactly at each cap** (5 tables on FREE, 30 menu items, 10 staff) | Boundary tests need N and N+1, not a fresh tenant |
| **One user per role** (SUPERADMIN, RESTAURANT_OWNER, STAFF, RECEPTIONIST, WAITER) | Role escalation matrix |
| **Menu with VAT-exempt Schedule 1 items** | FR-BILL-040 |
| **Menu with odd prices** (for example 133.33, 66.67) across 100+ lines | Float-drift test, FR-BILL-050 |
| **Bills straddling the 10,000 thresholds** (9,999 / 10,000 / 10,001) | FR-BILL-060 and FR-BILL-070 boundaries |
| **Bills spanning a fiscal year boundary** (Asar end to Shrawan 1) | FR-BILL-100 and sequence reset |
| **A voided bill and a credit note** | Audit trail |
| **Nepali-script item names and customer names** | NFR-COMPAT-050 |
| **Long item names exceeding 46 characters** | Receipt wrap, FR-PRT-020 |

Test data must never be created against a production database, and any PAN or customer detail used must be synthetic.

### 6.2 Test types required

| Type | Coverage expectation |
| --- | --- |
| Unit | `lib/billing/*` calculation, `amount-in-words`, `fiscal-year`, `plan-limits`, `table-token` |
| Integration | Server actions with a real test database, including the auth guard on every export |
| End-to-end | The four portals plus the guest flow, per the verify skill |
| Security | The full FR-TEN and NFR-SEC matrix, run adversarially |
| Concurrency | FR-BILL-110, FR-ORD-120, FR-TBL-040 |
| Accessibility | `verify:contrast` plus keyboard and screen-reader passes |
| Compatibility | The NFR-COMPAT matrix |
| Regression | All P1 items, before every release |

### 6.3 Traceability

Every test case must cite the requirement ID it exercises. A requirement with no test case is an untested requirement and blocks release if it is P1. Maintain the matrix in the form:

| Req ID | Test case IDs | Automated | Last run | Result |
| --- | --- | --- | --- | --- |
| FR-BILL-110 | TC-BILL-110-a, -b | partial (`verify:billing`) | | |

### 6.4 Entry criteria

Testing of a build may begin only when all of the following hold.

1. `npm run typecheck` passes clean.
2. `npm run verify:billing` passes in full.
3. `npm run verify:contrast` passes 68/68.
4. The build completes (`npx next build` with `JWT_SECRET` set).
5. A seeded test database is available and the test data in 6.1 exists.
6. The build is deployed to a test environment, or the dev server starts without error.

### 6.5 Exit criteria

A build is releasable when all of the following hold.

1. 100 percent of P1 requirements have an executed test case with a pass result.
2. 90 percent or more of P2 requirements pass.
3. Zero open Critical or High defects.
4. All FR-TEN (tenant isolation) and FR-BILL (billing correctness) requirements pass without exception. There is no acceptable partial pass in these two groups.
5. `/api/debug` is confirmed unreachable in production (NFR-SEC-110).
6. Known gaps in section 9 are documented and accepted by the product owner in writing.

### 6.6 Defect severity definitions

| Severity | Definition | Examples |
| --- | --- | --- |
| **Critical** | Data loss, cross-tenant leak, incorrect tax, or the system is unusable | One restaurant reads another's bills; duplicate invoice number; VAT miscalculated |
| **High** | Core workflow blocked with no workaround | Cannot close a bill; order stuck in a state; KOT does not print |
| **Medium** | Workflow impaired but a workaround exists | Report export mis-sums but the on-screen figure is right |
| **Low** | Cosmetic or minor | Contrast slightly off on a non-critical label; text truncation |

### 6.7 Documentation and handover requirements

- A test summary report per cycle: what ran, what passed, what failed, what was deferred.
- Reproduction steps for every open defect, including the tenant and role used.
- `bill-design.md` updated first whenever a billing rule changes, then the code. Its house rules apply: no em or en dashes, no emoji, and no hardcoded rates or thresholds. Where sources conflict, the value stays marked "Unconfirmed" and configurable rather than being silently settled.
- `CLAUDE.md` updated when architecture changes.

### 6.8 Deployment and rollback

- Migrations deploy with `npm run db:migrate:deploy`, never `db:push`, against production.
- A rollback plan exists for every migration that drops or renames a column.
- `NEXT_PUBLIC_APP_URL` is verified before release; a wrong value silently breaks every printed QR sticker, and stickers are physical objects that cannot be recalled cheaply.
- Uploaded images are understood to be ephemeral on Vercel and Netlify: the directory is wiped on every deploy and is not shared between serverless instances. Either accept this or resolve it before a customer uploads a real menu photo.

---

## 7. Risk Areas Ranked

Test effort should be weighted in this order.

1. **Tenant isolation.** The `restaurantId` is printed on every table QR sticker and is therefore public. A single unguarded server action export exposes a competitor's revenue.
2. **Invoice numbering under concurrency.** An unbroken serial is a legal requirement, and two cashiers closing tickets at once is the normal case, not an edge case.
3. **Tax calculation correctness.** Wrong VAT is a regulatory exposure for the restaurant, not just a bug.
4. **QR token rotation.** A guest who keeps the old link and can still order against a table that a new party now occupies is both a billing and a trust failure.
5. **Order state machine.** Illegal transitions corrupt the kitchen board and the bill.
6. **Plan gating on the server.** A hidden button is not a gate; the action must refuse.
7. **Float drift in long bills.** Mitigated by paisa arithmetic, but worth confirming rather than assuming.

---

## 8. Requirement Count Summary

| Group | Count | P1 |
| --- | --- | --- |
| Authentication (AUTH) | 11 | 9 |
| Tenant isolation (TEN) | 6 | 6 |
| Tables and QR (TBL) | 9 | 7 |
| Menu (MENU) | 8 | 6 |
| Ordering (ORD) | 12 | 10 |
| Printing (PRT) | 7 | 4 |
| Billing (BILL) | 20 | 19 |
| Payments (PAY) | 6 | 6 |
| Plans (PLAN) | 8 | 6 |
| Staff (STAFF) | 5 | 4 |
| Reception (RCP) | 7 | 4 |
| Owner (OWN) | 7 | 5 |
| Superadmin (SA) | 6 | 3 |
| Sync (SYNC) | 6 | 5 |
| Public (PUB) | 5 | 2 |
| **Functional total** | **123** | **96** |
| Non-functional total | 48 | - |

---

## 9. Known Gaps Affecting Testability

These are stated so a tester does not spend a day chasing a known limitation as if it were a defect.

1. **No automated test harness.** No `.test.*` or `.spec.*` files, and no vitest, jest, or playwright configuration exists. Only `verify:billing` and `verify:contrast` are automated. Everything else in this document is manual until NFR-MAINT-050 is met.
2. **Linting is broken** on two independent counts (section 3.3). Static analysis rests on `typecheck` alone.
3. **Image library index is a JSON file** at `public/uploads/_library.json`, not a database table. It is ephemeral on serverless hosts. Tracked as a known gap in the header comment of `lib/actions/image-library.ts`.
4. **CBMS is queue-only.** There is no live IRD endpoint to sync against, so FR-BILL-150 can only be tested to the queue boundary.
5. **Payment gateways are not integrated.** Only the webhook receiver and method labels exist, so FR-PAY-010 tests the record, not a real settlement.
6. **Turbopack dev rotates server action IDs**, so the on-disk manifest goes stale and curl-driven action testing needs live ID recovery each session.
7. **Two billing config values are marked UNCONFIRMED**: `buyerPanThreshold` (10,000 versus 1,00,000) and `cbmsThresholdHospitality` (5 crore, pending circular verification). Test against the configured value and flag the ambiguity rather than asserting a specific figure as correct.
8. **Rate limiting on login is unverified.** Confirm whether it exists before writing NFR-SEC-070 as a pass or a gap.

---

## 10. References

| Document | Role |
| --- | --- |
| `bill-design.md` | Specification of record for all billing and IRD behaviour |
| `CLAUDE.md` | Architecture reference, gotchas, file conventions |
| `.claude/skills/verify/SKILL.md` | How to launch the app and drive server actions via curl |
| `prisma/schema.prisma` | 36 models, the authoritative data contract |
| `lib/plan-limits.ts` | Single source of truth for plan caps and feature flags |
| `lib/billing/config.ts` | Every configurable rate and threshold |
| `docs/reception-cashier-roadmap.md` | Planned reception scope |
| `gov.md`, `TODO.md` | Supplementary context |
