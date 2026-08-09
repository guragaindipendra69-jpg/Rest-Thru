import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Terms of Service',
  description:
    'The terms that govern use of Resthru, covering subscriptions, acceptable ' +
    'use, service availability and account termination.',
  path: '/terms',
});

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
