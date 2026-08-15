"use server";

import { OAuth2Client } from "google-auth-library";
import prisma from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { mintGoogleTicket, verifyGoogleTicket } from "@/lib/google-ticket";

const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const client = new OAuth2Client(googleClientId);

function generateUsername(email: string): string {
  let base = email.split("@")[0] || "user";
  base = base.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  return `${base}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Confirms an OAuth access token was minted for *this* application.
 *
 * The id_token path gets this from `verifyIdToken({ audience })`. An access token
 * carries no verifiable audience of its own, so it has to be introspected:
 * Google's tokeninfo endpoint reports the client id the token was issued to.
 *
 * Without this check the userinfo lookup below proved only that the token was a
 * valid Google token belonging to that email — not that it was issued to us. Any
 * other Google OAuth app could take an access token its own users granted it and
 * post it here to sign in as those users, since `openid email profile` is the
 * scope every such app asks for. The bearer token is not a credential *for*
 * Resthru unless the audience says so.
 */
async function accessTokenAudienceOk(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) return false;
    const info = await res.json();
    // `aud` is the client the token was issued to; `azp` is the authorized party
    // when the two differ. Either matching ours means the token is genuinely for
    // this app.
    return info?.aud === googleClientId || info?.azp === googleClientId;
  } catch {
    return false;
  }
}

export async function googleLogin(credential: string) {
  if (!googleClientId) {
    return { error: "Google sign-in is not configured. Please set GOOGLE_CLIENT_ID." };
  }

  try {
    let email: string;
    let firstName: string;
    let lastName: string;
    let picture: string;

    // Try as access token first, fall back to id_token
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${credential}` },
    });

    if (userInfoRes.ok) {
      // Audience is checked before the profile is trusted — see above.
      if (!(await accessTokenAudienceOk(credential))) {
        return { error: "This Google token was not issued for Resthru." };
      }
      const info = await userInfoRes.json();
      email = info.email || "";
      firstName = info.given_name || "";
      lastName = info.family_name || "";
      picture = info.picture || "";
    } else {
      // Named `googleTicket` to keep it distinct from the registration ticket
      // minted further down — this one is Google's verification result.
      const googleTicket = await client.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });
      const payload = googleTicket.getPayload();
      if (!payload) return { error: "Invalid Google token" };
      email = payload.email || "";
      firstName = payload.given_name || "";
      lastName = payload.family_name || "";
      picture = payload.picture || "";
    }

    if (!email) {
      return { error: "Email not found in Google account" };
    }

    // Find existing user by email
    let user = await prisma.user.findUnique({ where: { email } });

    // Admins may only sign in through the superadmin console, exactly as the
    // password path enforces via `blockAdmin` (lib/actions/auth.ts). Google
    // sign-in is a public door, so without this an admin whose Google account
    // shares their platform email would get an admin cookie from this button —
    // and it is checked before any ticket is issued, so no downstream action can
    // mint one either.
    if (user && (user.role === "ADMIN" || user.role === "SUPER_ADMIN")) {
      return { error: "Please sign in through the admin console." };
    }

    // Deactivated accounts do not get in. `login()` filters on isActive in its
    // lookup; this path has to check it explicitly.
    if (user && !user.isActive) {
      return { error: "This account has been deactivated. Please contact support." };
    }

    if (!user) {
      // Create new user (no password needed for Google auth)
      user = await prisma.user.create({
        data: {
          email,
          username: generateUsername(email),
          firstName,
          lastName,
          profileImage: picture,
          role: "RESTAURANT_OWNER",
          isActive: true,
        },
      });
    } else {
      // Update profile image if not set
      if (!user.profileImage && picture) {
        await prisma.user.update({
          where: { id: user.id },
          data: { profileImage: picture },
        });
      }
      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    // Find restaurant by ownerId
    const restaurant = await prisma.restaurant.findFirst({
      where: { ownerId: user.id },
      select: { id: true, name: true, type: true, street: true, city: true, phoneNumber: true, isActive: true },
    });

    // Platform kill switch, same as the password path: an owner whose restaurant
    // the superadmin has closed cannot get in through Google either.
    if (restaurant && !restaurant.isActive) {
      return { error: "This restaurant has been closed by the administrator. Please contact support." };
    }

    // The proof that this account's Google credential was just verified. Every
    // follow-up action reads the account id out of this instead of taking it as
    // an argument, so neither can be used to sign in as someone else.
    const ticket = await mintGoogleTicket(user.id);

    // If the user already had a restaurant from a previous sign-up, don't let
    // them create a second one — prompt them to log in instead.
    if (restaurant) {
      return {
        success: true,
        alreadyRegistered: true,
        hasRestaurant: true,
        ticket,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          picture: user.profileImage || "",
        },
      };
    }

    // New user — go through the start free trial dialog
    return {
      success: true,
      needsRegistration: true,
      hasRestaurant: false,
      restaurant: null,
      ticket,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        picture: user.profileImage || "",
      },
    };
  } catch (err: any) {
    console.error("googleLogin error:", err?.message);
    return { error: "Failed to verify Google sign-in. Please try again." };
  }
}

/**
 * Creates a JWT session for an existing Google user so they can sign in without
 * going through the registration flow a second time.
 *
 * The account comes from the signed ticket `googleLogin` issued after verifying
 * the Google credential, never from an argument. It used to take a `userId`
 * directly: since a `"use server"` export is a public POST endpoint, and
 * `createSession` picks the cookie by the role on the database row, posting any
 * known account id here returned a working session cookie for that account —
 * including a superadmin's.
 */
export async function sessionForExistingGoogleUser(ticket: string) {
  try {
    const userId = await verifyGoogleTicket(ticket);
    if (!userId) return { error: "Your sign-in session expired. Please sign in with Google again." };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, role: true, firstName: true, lastName: true,
        email: true, restaurantId: true, isActive: true,
        restaurant: { select: { isActive: true } },
      },
    });
    if (!user) return { error: "User not found" };

    // Re-checked at the moment the session is minted rather than trusted from
    // ticket-issue time: the ticket is valid for minutes, and an account
    // deactivated or a restaurant closed in between must not still get in.
    if (!user.isActive) {
      return { error: "This account has been deactivated. Please contact support." };
    }
    if (user.restaurant && !user.restaurant.isActive) {
      return { error: "This restaurant has been closed by the administrator. Please contact support." };
    }
    if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
      return { error: "Please sign in through the admin console." };
    }

    await createSession({
      id: user.id,
      username: user.username || "",
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      restaurantId: user.restaurantId ?? null,
    });

    return { success: true, redirectTo: "/owner" };
  } catch {
    return { error: "Failed to create session" };
  }
}
