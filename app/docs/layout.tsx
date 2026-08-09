import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Documentation',
  description:
    'Resthru documentation: set up your menu, tables and QR ordering, configure ' +
    'KOT printing, and issue IRD-compliant VAT invoices.',
  path: '/docs',
});

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
