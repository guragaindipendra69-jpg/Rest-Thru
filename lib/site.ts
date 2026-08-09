/**
 * Canonical site origin and shared SEO copy.
 *
 * Every absolute URL the crawlers see -- canonical tags, sitemap entries,
 * robots.txt, OG/Twitter image URLs, JSON-LD @id values -- resolves through
 * `siteUrl()`. One resolver means moving from the Vercel subdomain to a real
 * domain is an environment change, not a code change.
 *
 * Resolution order, first hit wins:
 *   1. NEXT_PUBLIC_APP_URL          -- the real domain once you own one. Also
 *                                      what table QR codes already use, so
 *                                      setting it fixes SEO and QR in one go.
 *   2. VERCEL_PROJECT_PRODUCTION_URL -- Vercel's stable production hostname.
 *                                      Preferred over VERCEL_URL because that
 *                                      one is unique per deployment and would
 *                                      emit a different canonical on every
 *                                      push, splitting ranking signals across
 *                                      dozens of one-off hostnames.
 *   3. VERCEL_URL                   -- per-deployment host. Previews are
 *                                      noindex, so this only ever backs a real
 *                                      origin rather than leaking localhost.
 *   4. http://localhost:3000        -- dev fallback. If this is reached in
 *                                      production the deploy is misconfigured,
 *                                      so `isIndexableHost()` withholds
 *                                      indexing rather than publishing a
 *                                      canonical that points at localhost.
 */

const FALLBACK_DEV_ORIGIN = 'http://localhost:3000';

// Next builds pages across many workers and calls siteUrl() once per page, so
// an unguarded warning prints dozens of identical lines and buries the rest of
// the build log. One line per process is enough to notice.
let warnedMissingOrigin = false;

function normalise(raw: string): string {
  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return normalise(explicit);

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return normalise(vercelProd);

  // Per-deployment hostname. Not ideal as a canonical (it changes on every
  // push), but on a preview deploy the pages are noindex anyway, and having a
  // real origin beats falling through to localhost.
  const vercelDeploy = process.env.VERCEL_URL?.trim();
  if (vercelDeploy) return normalise(vercelDeploy);

  // Deliberately a warning, not a throw. An unset origin degrades metadata --
  // it does not make the app incorrect -- so it must not be able to fail a
  // production build or take a running site down. The warning is loud enough
  // to catch in deploy logs.
  if (process.env.NODE_ENV === 'production' && !warnedMissingOrigin) {
    warnedMissingOrigin = true;
    console.warn(
      '[site] NEXT_PUBLIC_APP_URL is not set. Canonical URLs, the sitemap and ' +
        'QR codes will fall back to ' + FALLBACK_DEV_ORIGIN + ', which crawlers ' +
        'cannot reach. Set it in the deployment environment.'
    );
  }

  return FALLBACK_DEV_ORIGIN;
}

/** Absolute URL for a site-relative path. Crawlers ignore relative URLs. */
export function absoluteUrl(path = '/'): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * True only on the canonical production host. Used to decide whether robots
 * may index at all: preview deployments share this code but must never be
 * indexed, or Google sees the same content on many hostnames and picks a
 * preview URL as the canonical one.
 *
 * Also returns false when the origin could not be resolved off the Vercel
 * platform -- a production build running with neither VERCEL_URL nor
 * NEXT_PUBLIC_APP_URL set would otherwise advertise localhost as canonical.
 */
export function isIndexableHost(): boolean {
  if (process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development') {
    return false;
  }
  const originResolved =
    !!process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    !!process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    !!process.env.VERCEL_URL?.trim();
  return originResolved;
}

export const SITE_NAME = 'Resthru';

export const SITE_TAGLINE = 'Restaurant Management Software for Nepal';

/**
 * Root description. Leads with the concrete job and the market, because that
 * pairing ("restaurant POS" + "Nepal" + "IRD billing") is what both search
 * queries and AI answer engines actually match on. Kept under 160 chars so
 * Google renders it whole.
 */
export const SITE_DESCRIPTION =
  'Resthru is restaurant management software built for Nepal. Run orders, KOT, ' +
  'IRD-compliant VAT billing, tables and inventory from one dashboard.';

export const SITE_LOCALE = 'en_NP';
