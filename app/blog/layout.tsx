import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Blog',
  description:
    'Practical guides for running a restaurant in Nepal: VAT and IRD billing ' +
    'rules, menu costing, staff scheduling and cutting table turnaround time.',
  path: '/blog',
});

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
