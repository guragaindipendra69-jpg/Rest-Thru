'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowRight, UtensilsCrossed, BarChart3, Users, Receipt, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { login } from '@/lib/actions/auth';
import { GoogleSignInButton } from '@/components/shared/google-sign-in';
import { GoogleRegistrationDialog } from '@/components/shared/google-registration-dialog';

// The single sign-in door for every restaurant role: owner, legacy STAFF,
// receptionist and waiter. There used to be four of these forms — /owner/login,
// /order/login, /reception/order/login and this one — which meant a new waiter
// had to be told a different URL from the receptionist standing next to them, and
// typing valid credentials into the wrong one worked but landed you on a screen
// your role could not open. The role now decides the destination (see `login()`
// and ROLE_HOME), so there is nothing to know.
//
// Consolidating the door does not consolidate the sessions: each portal still has
// its own cookie, so one browser can hold an owner and a waiter session at once.
//
// /superadmin/login is deliberately still separate. `login()` refuses admin
// credentials here via blockAdmin, with the same generic message as a wrong
// password so this form cannot be used to discover that an account is an admin.

const loginSchema = z.object({
  email: z.string().min(1, 'Email or phone is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

const features = [
  { icon: BarChart3, text: 'Real-time analytics & reports' },
  { icon: Users, text: 'Staff management & scheduling' },
  { icon: Receipt, text: 'IRD-compliant billing' },
];

function LoginForm() {
  const searchParams = useSearchParams();
  // Forwarded by the proxy when it turns an unauthenticated request away. Passed
  // through to `login()`, which reduces it to the user's own role home unless it
  // is a same-origin path inside their portal — it is a query parameter, so it is
  // never trusted as a navigation target on its own.
  const redirectParam = searchParams.get('redirect') || undefined;
  // guardArea appends ?closed=1 when it bounces a session whose restaurant the
  // superadmin has closed mid-shift. Without this the user is returned to a bare
  // login form with no idea why, and their password looks broken.
  const closed = searchParams.get('closed') === '1';

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleUser, setGoogleUser] = useState<{ id: string; email: string; firstName: string; lastName: string; picture: string; alreadyRegistered?: boolean; ticket?: string } | null>(null);

  useEffect(() => {
    if (closed) {
      toast.error('This restaurant has been closed by the administrator. Please contact support.');
    }
  }, [closed]);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const result = await login(data.email.trim(), data.password, redirectParam, { blockAdmin: true });
      if (result?.error) {
        toast.error(result.error);
        setIsLoading(false);
        return;
      }
      toast.success('Welcome back to Resthru!');
      // Full navigation rather than router.push: waiters and receptionists share
      // station devices, and this guarantees no in-memory store state (a previous
      // waiter's open table, say) survives into the next person's session. The
      // loading state is intentionally left on — the page is being replaced.
      window.location.assign(result.redirectTo || '/owner');
    } catch {
      toast.error('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh]">
      {/* Left Panel - Branding. Desktop only; on a waiter's phone the form gets
          the whole viewport. */}
      <div className="relative hidden lg:flex lg:w-3/5 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary-hover to-primary-deep p-12">
        {/* Decorative circles */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white/5" />
          <div className="absolute top-1/2 -right-48 w-[500px] h-[500px] rounded-full bg-white/5" />
          <div className="absolute -bottom-20 left-1/3 w-72 h-72 rounded-full bg-white/5" />
        </div>

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur-sm rounded-xl">
              <UtensilsCrossed className="w-8 h-8 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">Resthru</span>
          </Link>
        </div>

        <div className="relative z-10 max-w-lg">
          <motion.h2
            className="text-4xl font-bold text-white leading-tight mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Run smarter.
            <br />
            Serve better.
          </motion.h2>
          <motion.p
            className="text-lg text-white/70 mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Sign in to manage orders, track revenue, and grow your restaurant.
          </motion.p>

          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {features.map((feature, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                  <feature.icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-white/90">{feature.text}</span>
              </div>
            ))}
          </motion.div>
        </div>

        <div className="relative z-10">
          <p className="text-sm text-white/80">Trusted by 500+ restaurants across Nepal</p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-xl">
                <UtensilsCrossed className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xl font-bold text-primary">Resthru</span>
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold">Welcome back</h1>
            <p className="mt-2 text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <Label htmlFor="email">Email or Phone No</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <FormControl>
                        <Input
                          id="email"
                          // Station devices are phones: keep the keyboard from
                          // capitalising or autocorrecting a username.
                          autoCapitalize="none"
                          autoCorrect="off"
                          autoComplete="username"
                          placeholder="you@example.com or +977..."
                          disabled={isLoading}
                          className="pl-10 h-12 text-base"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <Link
                        href="/owner/forgot-password"
                        className="text-xs text-primary hover:text-primary-hover font-medium"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <FormControl>
                        <Input
                          id="password"
                          placeholder="Enter your password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          disabled={isLoading}
                          className="pl-10 pr-12 h-12 text-base"
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        // 36px target — thumb-reachable on a station phone.
                        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                        disabled={isLoading}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-primary hover:bg-primary-hover text-white font-semibold text-base"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </Form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-muted-foreground">or</span>
            </div>
          </div>

          <GoogleSignInButton onSuccess={(user) => setGoogleUser(user)} />

          {/* Staff whose logins the owner issued (receptionists, waiters) sign in
              with the form above; only owners self-register, so the trial link
              stays owner-facing. */}
          <p className="text-center text-sm text-muted-foreground mt-8">
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="text-primary hover:text-primary-hover font-semibold transition-colors"
            >
              Start free trial
            </Link>
          </p>
        </motion.div>

        {googleUser && (
          <GoogleRegistrationDialog
            open={!!googleUser}
            onOpenChange={(open) => { if (!open) setGoogleUser(null); }}
            user={googleUser}
            alreadyRegistered={googleUser.alreadyRegistered}
          />
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary to keep this page from opting the
  // whole route into client-side rendering.
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
