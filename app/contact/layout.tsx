import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Contact',
  description:
    'Talk to the Resthru team about restaurant management software in Nepal. ' +
    'Ask about setup, migration from paper khata, pricing or a live demo.',
  path: '/contact',
});

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
