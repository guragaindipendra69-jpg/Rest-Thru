import { LoginRedirect } from '@/components/shared/login-redirect';

// The reception order-entry station's own sign-in form used to live here - it is
// one of the four retired doors named in LoginRedirect's docstring. Forwards to
// the shared login rather than 404ing, for the same reason the other stubs do.
export default LoginRedirect;
