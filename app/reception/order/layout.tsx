// Server Component gate for the reception order-entry area.
// The parent reception/layout.tsx already guards for RECEPTIONIST; this is
// defense-in-depth for /reception/order/* sub-routes.
import { guardArea } from '@/lib/auth-guard';
import { RECEPTION_AUTH_ROUTES, SHARED_LOGIN_PATH } from '@/lib/constants';

export default async function ReceptionOrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardArea({
    allowedRoles: ['RECEPTIONIST'],
    loginPath: SHARED_LOGIN_PATH,
    // Was ORDER_AUTH_ROUTES, which is ['/order/login'] - a path that can never
    // occur under /reception/order/*, so the skip list was inert. The route this
    // layout actually has to let through is /reception/order/login.
    publicPaths: RECEPTION_AUTH_ROUTES,
  });

  return <>{children}</>;
}
