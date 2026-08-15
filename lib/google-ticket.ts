// Short-lived signed proof that Google sign-in verified a particular account.
//
// The Google sign-up flow is two round trips: `googleLogin` verifies the Google
// credential, then the registration dialog calls back either to finish creating
// the restaurant (`completeGoogleRegistration`) or to sign an existing user in
// (`sessionForExistingGoogleUser`). No session cookie exists in between, so the
// second call used to be handed the raw account id and trust it.
//
// Every export of a `"use server"` module is a public POST endpoint, so that
// made both follow-up actions unauthenticated session mints: post a known user
// id and get a logged-in cookie for that account. `createSession` picks the
// portal cookie from the role on the database row, so a superadmin's id yielded
// a superadmin cookie — no password, no Google account, nothing but the id.
//
// This ticket closes the gap. It is issued at the one point where identity was
// actually proven, and the follow-up actions take the account id from the
// verified payload instead of from their arguments.
//
// Two properties matter:
//
//   - The signing key is domain-separated from JWT_SECRET rather than being it.
//     A ticket therefore cannot be replayed as a session cookie, nor a session
//     cookie presented as a ticket: each verifier reads the other's tokens as
//     invalid signatures. Sharing the key would matter, because a ticket carries
//     no `role` and `portalForRole(undefined)` falls through to the owner
//     portal — so a ticket dropped into `session_owner` would otherwise verify
//     and produce a session with an undefined user id.
//
//   - It carries no role, no restaurantId, and no other authorization claim.
//     Only which account Google authenticated, and until when. Everything the
//     session needs is re-read from the database by the action that consumes it,
//     so a stale ticket cannot carry stale privileges.

import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { jwtSecret } from "@/lib/jwt-secret";

// Derived, not reused: HMAC of the session secret under a fixed label. Changing
// the label invalidates every outstanding ticket without touching sessions.
const TICKET_KEY = new Uint8Array(
  crypto
    .createHmac("sha256", Buffer.from(jwtSecret))
    .update("resthru:google-registration-ticket:v1")
    .digest()
);

const PURPOSE = "google-registration";

// Long enough to fill in the three-step registration dialog, short enough that a
// ticket leaked from a browser history or a proxy log is worthless by the time
// anyone finds it.
const TTL = "15m";

/**
 * Issues a ticket for an account whose Google credential has just been verified.
 * Call this only after that verification, never from a caller-supplied id.
 */
export async function mintGoogleTicket(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(TICKET_KEY);
}

/**
 * Returns the account id a ticket vouches for, or null if it is missing,
 * expired, tampered with, signed by something else, or not a registration
 * ticket. Callers must treat null as "not authenticated" and stop.
 */
export async function verifyGoogleTicket(ticket: unknown): Promise<string | null> {
  if (typeof ticket !== "string" || !ticket) return null;
  try {
    const { payload } = await jwtVerify(ticket, TICKET_KEY);
    if (payload.purpose !== PURPOSE) return null;
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
