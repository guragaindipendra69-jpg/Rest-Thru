import { pageMetadata } from '@/lib/seo';

// noIndex: the content is live operational state, so an indexed copy is stale
// the moment it is crawled -- and a cached "degraded" snapshot in search
// results would misrepresent the service. Still followed, so link equity
// reaches the pages it points at.
export const metadata = pageMetadata({
  title: 'System Status',
  description: 'Live availability of Resthru ordering, billing and sync services.',
  path: '/status',
  noIndex: true,
});

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
