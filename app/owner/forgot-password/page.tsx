import { LifeBuoy, Mail, ShieldCheck, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

/**
 * Account recovery instructions. Deliberately not a form.
 *
 * This page used to reset any account's password. It generated its "verification
 * code" in the browser with Math.random(), printed it on screen, compared it
 * against its own React state, and then called a `resetPassword(username,
 * newPassword)` server action that took no session and no token. Anyone who
 * reached this URL could take over any account on the platform, including a
 * SUPER_ADMIN, by typing a username and reading the code back to the page.
 *
 * A real reset needs a single-use token with an expiry, delivered out of band to a
 * contact already stored on the account, and verified server side. There is no
 * mailer or SMS sender in this repo yet, so the honest thing is to route people to
 * the two paths that already exist and are actually gated:
 *
 *   - staff -> their own restaurant owner, who can set staff passwords from the
 *     owner staff directory
 *   - owners -> platform support, which uses resetRestaurantOwnerPassword in
 *     lib/actions/admin.ts behind requireAdmin()
 *
 * Signed-in users who just want a new password use /owner/password-reset.
 *
 * The route stays because the owner login page, the marketing login modal, and
 * lib/constants.ts all link here. When a mailer lands, this is where the real flow
 * goes; until then it must not accept a password.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-xl bg-primary flex items-center justify-center mb-2">
            <LifeBuoy className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Recover Your Account</CardTitle>
          <CardDescription>
            Passwords are reset by a person, not by this page. Pick whichever
            describes you.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-border bg-muted/40 p-4">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserCog className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold leading-tight">
                You are staff, a receptionist, or a waiter
              </p>
              <p className="text-sm text-muted-foreground">
                Ask your restaurant owner. They can set a new password for your
                account from the staff directory in their dashboard.
              </p>
            </div>
          </div>

          <div className="flex gap-3 rounded-xl border border-border bg-muted/40 p-4">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold leading-tight">
                You are the restaurant owner
              </p>
              <p className="text-sm text-muted-foreground">
                Email{" "}
                <a
                  href="mailto:support@resthru.com?subject=Password%20reset%20request"
                  className="font-medium text-primary hover:underline"
                >
                  support@resthru.com
                </a>{" "}
                from the address on your account and include your restaurant name.
                Support verifies you and issues a new password.
              </p>
            </div>
          </div>

          <div className="flex gap-3 rounded-xl border border-border bg-muted/40 p-4">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold leading-tight">
                You still know your password
              </p>
              <p className="text-sm text-muted-foreground">
                Sign in and change it from{" "}
                <Link
                  href="/owner/password-reset"
                  className="font-medium text-primary hover:underline"
                >
                  Change Password
                </Link>
                .
              </p>
            </div>
          </div>

          <Link href="/owner/login" className="block">
            <Button variant="outline" className="w-full">
              Back to login
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
