import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/site';

/**
 * Served at /manifest.webmanifest.
 *
 * Beyond installability, this is a machine-readable statement of what the
 * product is -- name, category, description -- which is one more structured
 * signal for crawlers that only read files rather than render pages.
 *
 * `start_url` is '/' rather than a portal: an installed shell should open the
 * public entry point, since which of the four portals a user belongs to is
 * only known after login.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    // Matches --primary in globals.css. Referenced as a literal because a
    // manifest cannot read a CSS custom property; keep in step with the token.
    background_color: '#ffffff',
    theme_color: '#0f6b4f',
    orientation: 'portrait-primary',
    categories: ['business', 'productivity', 'food'],
    lang: 'en-NP',
    dir: 'ltr',
    icons: [
      {
        src: '/icon.svg',
        // 'any' rather than fixed dimensions: the source is SVG, so it scales
        // to whatever size the platform asks for.
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
