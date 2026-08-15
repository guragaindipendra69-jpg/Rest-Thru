import { redirect } from 'next/navigation';
import { SHARED_LOGIN_PATH } from '@/lib/constants';

/**
 * Forwards a retired per-portal login URL to the one shared login form.
 *
 * There were four sign-in forms — /owner/login, /order/login,
 * /reception/order/login and /login — so a new waiter had to be told a different
 * URL from the receptionist beside them, and valid credentials typed into the
 * wrong one signed you in but landed you on a screen your role could not open.
 * `login()` routes by role now, so the other three are stubs built on this.
 *
 * Redirects rather than 404s because these URLs are bookmarked on station tablets
 * and staff phones, and because proxy.ts still names /owner/login and
 * /order/login as portal login paths for links already in circulation.
 *
 * Both query parameters are forwarded, neither is trusted:
 *  - `redirect`, the target the proxy turned away, which `login()` validates
 *    against the signing-in user's own role before any navigation happens.
 *  - `closed=1`, which `guardArea` appends when a restaurant is closed
 *    mid-session, so the shared form can say why instead of showing a bare
 *    password box that looks broken.
 */
export async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { redirect: target, closed } = await searchParams;

  const params = new URLSearchParams();
  if (typeof target === 'string' && target) params.set('redirect', target);
  if (closed === '1') params.set('closed', '1');

  const query = params.toString();
  redirect(query ? `${SHARED_LOGIN_PATH}?${query}` : SHARED_LOGIN_PATH);
}
