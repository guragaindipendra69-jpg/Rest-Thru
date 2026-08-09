import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

/**
 * Served at /sitemap.xml.
 *
 * Only public marketing routes belong here. Authenticated portals and the
 * tenant guest-ordering routes are excluded for the reasons in robots.ts --
 * a sitemap entry is a crawl invitation, so listing a disallowed URL just
 * sends mixed signals.
 *
 * `priority` is a weak hint at best and Google largely ignores it; the values
 * below are ordered by how much each page is meant to win traffic, with the
 * commercial pages (landing, pricing) ahead of the legal boilerplate.
 */

type Entry = {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
};

const ROUTES: Entry[] = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/pricing', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/help', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/blog', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/careers', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/status', priority: 0.3, changeFrequency: 'daily' },
  { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.2, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  // One timestamp for the whole build. Per-entry Date.now() would claim every
  // page changed on every deploy, which trains crawlers to distrust the field.
  const lastModified = new Date();

  return ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency,
    priority,
  }));
}
