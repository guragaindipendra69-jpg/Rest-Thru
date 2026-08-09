import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Careers',
  description:
    'Join Resthru and build restaurant software used by kitchens across Nepal. ' +
    'See open engineering, design and customer support roles.',
  path: '/careers',
});

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
