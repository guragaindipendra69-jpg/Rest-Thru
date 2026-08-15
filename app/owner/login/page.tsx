import { LoginRedirect } from '@/components/shared/login-redirect';

// The owner dashboard's own sign-in form used to live here. Every restaurant role
// now signs in at the one shared door, which routes by role. See LoginRedirect for
// why this forwards instead of 404ing.
export default LoginRedirect;
