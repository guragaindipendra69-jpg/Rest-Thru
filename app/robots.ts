import type { MetadataRoute } from 'next';
import { absoluteUrl, isIndexableHost } from '@/lib/site';

/**
 * Served at /robots.txt.
 *
 * Two jobs. First, keep the four authenticated portals and the API out of the
 * index -- they are useless in search results and leak structure. Second, and
 * more important for a multi-tenant app: keep crawlers out of /r/ and /order,
 * the guest ordering routes. Those URLs carry a table's rotating QR token, so
 * an indexed one is both a dead link (the token rotates on checkout) and a
 * public record of a restaurant's internal table IDs.
 *
 * AI crawlers are allowed deliberately. GPTBot, ClaudeBot, PerplexityBot and
 * Google-Extended are what answer engines read to learn a product exists, so
 * blocking them would cost exactly the AI visibility this is meant to win.
 */
export default function robots(): MetadataRoute.Robots {
  // Preview deployments must never be indexed: same content on a second
  // hostname makes Google choose which is canonical, and it sometimes chooses
  // the preview.
  if (!isIndexableHost()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  const disallow = [
    '/api/',
    '/superadmin/',
    '/owner/',
    '/reception/',
    '/order',
    '/r/',
    '/login',
    '/register',
  ];

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      // Named explicitly so an allow decision for AI is on the record rather
      // than inherited from the wildcard and silently changed later.
      { userAgent: 'GPTBot', allow: '/', disallow },
      { userAgent: 'ClaudeBot', allow: '/', disallow },
      { userAgent: 'PerplexityBot', allow: '/', disallow },
      { userAgent: 'Google-Extended', allow: '/', disallow },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
