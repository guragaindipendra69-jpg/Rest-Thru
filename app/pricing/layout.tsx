import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Pricing',
  description:
    'Resthru pricing for restaurants in Nepal. Start free forever, no credit ' +
    'card. Paid plans add unlimited tables, staff accounts and IRD VAT billing.',
  path: '/pricing',
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
