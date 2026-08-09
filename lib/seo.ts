import type { Metadata } from 'next';
import { SITE_NAME, SITE_LOCALE } from '@/lib/site';

/**
 * Builds page metadata with the canonical URL and OG/Twitter blocks filled in.
 *
 * Why every marketing page needs a `layout.tsx` to use this: those pages are
 * all `'use client'`, and Next.js only reads a `metadata` export from a Server
 * Component. Exporting it from a client page is not an error -- it is silently
 * ignored, which is why all 11 pages were inheriting the root title despite
 * looking fine. A tiny server layout beside each page is the supported way to
 * attach metadata without rewriting the page as a Server Component.
 *
 * `canonical` is relative on purpose: `metadataBase` in the root layout makes
 * it absolute, so the origin stays defined in exactly one place.
 */
export function pageMetadata({
  title,
  description,
  path,
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  /** For pages with no search value (auth screens, live status). */
  noIndex?: boolean;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      url: path,
      // OG needs the brand spelled out: a share card has no <title> template
      // to inherit from, so "Pricing" alone would lose all context.
      title: `${title} | ${SITE_NAME}`,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
    },
    ...(noIndex
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}
