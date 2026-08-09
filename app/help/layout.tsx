import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Help Centre',
  description:
    'Answers to common Resthru questions: billing and VAT, table QR codes, ' +
    'staff roles and permissions, printers, and day-to-day troubleshooting.',
  path: '/help',
});

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
