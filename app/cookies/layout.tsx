import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Cookie Policy',
  description:
    'Which cookies Resthru sets, what each one does, and how session cookies ' +
    'keep you signed in across the owner, reception and waiter portals.',
  path: '/cookies',
});

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
