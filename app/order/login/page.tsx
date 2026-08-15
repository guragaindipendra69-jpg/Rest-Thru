import { LoginRedirect } from '@/components/shared/login-redirect';

// The waiter station's own mobile sign-in form used to live here. Waiters now sign
// in at the one shared door alongside every other role and are routed to /order by
// `login()`. The shared form keeps the mobile affordances this one had — 48px
// inputs, no autocapitalise, full navigation on success so a shared station device
// carries no state between waiters.
export default LoginRedirect;
