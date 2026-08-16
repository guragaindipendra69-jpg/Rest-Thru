// Server Component — runs the auth gate on the server before the reception
// shell (Client Component) renders. Previously this was a plain pass-through
// wrapper with no auth check, relying entirely on proxy.ts.
import { Suspense } from 'react';
import ReceptionShell from './shell';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { guardArea } from '@/lib/auth-guard';
import { RECEPTION_AUTH_ROUTES, SHARED_LOGIN_PATH } from '@/lib/constants';

export default async function ReceptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The proxy is the primary gate (unauthenticated /reception → the shared staff
  // login, WAITER → /order, RESTAURANT_OWNER → /owner); this repeats the check at
  // the layout level.
  const session = await guardArea({
    allowedRoles: ['RECEPTIONIST'],
    loginPath: SHARED_LOGIN_PATH,
    publicPaths: RECEPTION_AUTH_ROUTES,
  });

  // A null session here means a public path (guardArea redirects in every other
  // case), i.e. one of the login stubs. Render it bare. Wrapping it in
  // ReceptionShell instead puts its redirect() *inside* the shell's Suspense
  // boundary, which Next resolves by falling back to client rendering — so the
  // whole signed-in till navigation paints for an anonymous visitor and only
  // then jumps to /login.
  if (!session) return <>{children}</>;

  return (
    <ReceptionShell>
      <Suspense fallback={<PageSkeleton />}>
        {children}
      </Suspense>
    </ReceptionShell>
  );
}
