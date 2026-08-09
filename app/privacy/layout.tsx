import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Privacy Policy',
  description:
    'How Resthru collects, stores and protects restaurant and customer data, ' +
    'including where data is hosted and how long records are retained.',
  path: '/privacy',
});

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
