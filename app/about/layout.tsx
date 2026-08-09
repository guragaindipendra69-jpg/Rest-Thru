import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'About',
  description:
    'Resthru is built in Nepal for Nepali restaurants. Learn who we are, why we ' +
    'built restaurant software for the local market, and how we support owners.',
  path: '/about',
});

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
