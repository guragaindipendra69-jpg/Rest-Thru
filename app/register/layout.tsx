import { pageMetadata } from '@/lib/seo';

// Intentionally noindex even though it is a signup page: the marketing pages
// are the ones meant to rank and they all link here. Indexing a bare form adds
// a thin-content page competing with /pricing for the same queries.
export const metadata = pageMetadata({
  title: 'Create Account',
  description: 'Start your free Resthru account and set up your restaurant.',
  path: '/register',
  noIndex: true,
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
