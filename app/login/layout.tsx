import { pageMetadata } from '@/lib/seo';

// robots.txt disallows /login, but Disallow only prevents crawling -- Google
// can still index a URL it never fetched if another site links to it, showing a
// bare titleless entry. The noindex directive here is what actually keeps it
// out of results.
export const metadata = pageMetadata({
  title: 'Log In',
  description: 'Sign in to your Resthru restaurant dashboard.',
  path: '/login',
  noIndex: true,
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
