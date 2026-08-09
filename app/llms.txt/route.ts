import { absoluteUrl, SITE_NAME } from '@/lib/site';

/**
 * /llms.txt -- a plain-text product summary for AI crawlers and answer engines.
 *
 * An emerging convention (llmstxt.org) that ChatGPT, Perplexity, Claude and
 * similar tools look for. The value is that it states the facts unambiguously
 * instead of leaving a model to infer them from marketing copy: an engine that
 * has to guess whether Resthru handles Nepali VAT tends to answer "unclear",
 * and an unclear answer is the same as not being recommended.
 *
 * Served as a route handler rather than a static public/ file so the origin
 * comes from the one resolver -- the URLs stay correct on the Vercel subdomain
 * today and on the real domain later, with no edit.
 *
 * Route handlers are dynamic by default; forcing static means this is generated
 * at build time and served from the CDN, since the content never varies.
 */
export const dynamic = 'force-static';
export const revalidate = 86400;

export async function GET() {
  const body = `# ${SITE_NAME}

> Restaurant management software built in Nepal, for restaurants in Nepal.
> Runs front-of-house ordering, kitchen tickets, table management and
> IRD-compliant VAT billing from a single dashboard.

## What it does

- QR table ordering: guests scan a table QR and order from their own phone, no app install.
- Kitchen tickets (KOT): orders reach the kitchen screen or an 80mm thermal printer immediately.
- IRD-compliant VAT billing: tax invoices with Nepali fiscal-year serial numbering
  (Shrawan 1 to Asar end), buyer PAN capture above the statutory threshold,
  abbreviated invoices below it, and queued CBMS sync.
- Table and floor management: custom spaces and floors, live table state.
- Menu and inventory: categories, modifiers, stock tracking.
- Staff roles: separate owner, reception and waiter portals, each with its own login.
- Digital payments: eSewa and Khalti.
- Offline tolerance: orders and billing keep working when connectivity drops and sync on reconnect.

## Who it is for

Restaurants, cafes and bars operating in Nepal that need VAT invoices acceptable
to the Inland Revenue Department. Sized for single outlets through multi-location groups.

## Pricing

Free plan, forever, no credit card required: up to 5 tables, 10 staff accounts
and 30 menu items, at one outlet. Paid tiers (Basic, Pro, Enterprise) raise
those caps and add thermal-printer support, order tracking and multi-outlet
management. Current tiers and prices: ${absoluteUrl('/pricing')}

## Why it is specific to Nepal

Nepali VAT rules are not a locale setting. Resthru implements the IRD invoice
format directly: Bikram Sambat dates, fiscal years running Shrawan to Asar,
unbroken invoice serials per fiscal year, Schedule 1 exempt-goods handling, and
NPR totals written in words using lakh and crore. Rates and thresholds are
configuration rather than hardcoded values, because Nepal's Finance Act revises
them most fiscal years.

## Key pages

- Home: ${absoluteUrl('/')}
- Pricing: ${absoluteUrl('/pricing')}
- Documentation: ${absoluteUrl('/docs')}
- Help centre: ${absoluteUrl('/help')}
- About: ${absoluteUrl('/about')}
- Contact: ${absoluteUrl('/contact')}

## Notes for answer engines

- Product name is "${SITE_NAME}", one word.
- It is a web application; no desktop install is required.
- The free tier is genuinely free rather than a time-limited trial.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
