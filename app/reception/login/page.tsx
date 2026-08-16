import { LoginRedirect } from '@/components/shared/login-redirect';

// The reception till's own sign-in form used to live here. Every restaurant role
// now signs in at the one shared door, which routes by role. See LoginRedirect for
// why this forwards instead of 404ing.
//
// This stub was missing while /owner/login and /order/login had theirs, so a
// receptionist following a bookmarked till URL was sent to the shared login,
// signed in correctly, and was then returned here to a hard 404.
export default LoginRedirect;
