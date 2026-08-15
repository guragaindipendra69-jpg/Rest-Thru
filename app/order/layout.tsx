// Server Component gate for the waiter order-entry area. Previously /order had
// no layout at all — only app/order/page.tsx did an inline session check, so
// any future route added under /order would have been unprotected. This gate
// covers the whole segment.
import { guardArea } from '@/lib/auth-guard';
import { ORDER_AUTH_ROUTES, SHARED_LOGIN_PATH } from '@/lib/constants';

export default async function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The proxy is the primary gate (unauthenticated /order → the shared staff
  // login, RECEPTIONIST → /reception, RESTAURANT_OWNER → /owner); this repeats
  // the check at the layout level. /order/login is public so the guard doesn't
  // redirect-loop the stub that forwards to the shared form.
  await guardArea({
    allowedRoles: ['WAITER'],
    loginPath: SHARED_LOGIN_PATH,
    publicPaths: ORDER_AUTH_ROUTES,
  });

  return <>{children}</>;
}
