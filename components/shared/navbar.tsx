'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UtensilsCrossed, Menu, ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHARED_LOGIN_PATH } from '@/lib/constants';
import { RegisterModal } from '@/components/shared/register-modal';

/**
 * Scroll-aware navigation.
 *
 * At the top of the page the bar is genuinely transparent — it sits over the
 * hero with no surface of its own. Once scrolled, it contracts into a floating
 * pill: rounded, translucent, backdrop-blurred, lifted with a soft shadow.
 *
 * The previous version never actually achieved the transparent state: the outer
 * <nav> toggled bg-transparent, but the inner desktop container hardcoded
 * `bg-background/80 shadow-sm backdrop-blur-xl`, so an opaque surface covered
 * the transparent parent at every scroll position. Both layers are now driven
 * by the same `isScrolled` flag.
 *
 * Layout stability: the nav is fixed and the height of its row is constant
 * (h-16) in both states. Only padding, radius, colour and shadow animate — never
 * anything that changes document flow — so the hero never jumps as you scroll.
 */
/**
 * @param overlay When true the bar floats over the page content (used on the
 *   landing page, where it sits transparently on top of the coloured hero).
 *   When false — the default — a spacer preserves the layout flow the old
 *   `sticky` bar occupied, so the ~10 secondary pages that render <Navbar />
 *   above ordinary content keep their spacing and nothing slides underneath.
 */
const Navbar = ({ overlay = false }: { overlay?: boolean }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // rAF-throttled + passive: the raw scroll handler fired a setState on every
    // scroll event, which on a long landing page meant hundreds of renders a
    // second and visible jank on mid-range Android.
    let ticking = false;
    const update = () => {
      setIsScrolled(window.scrollY > 12);
      ticking = false;
    };
    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };
    update(); // honour a restored scroll position on mount
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // `open-login` predates the shared login page, when it opened a modal here.
    // It now navigates, so any existing dispatcher keeps working and lands on the
    // one door instead of a fifth copy of the form.
    const handleLogin = () => router.push(SHARED_LOGIN_PATH);
    const handleRegister = () => setRegisterOpen(true);
    document.addEventListener('open-login', handleLogin);
    document.addEventListener('open-register', handleRegister);
    return () => {
      document.removeEventListener('open-login', handleLogin);
      document.removeEventListener('open-register', handleRegister);
    };
  }, [router]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  // Close the mobile sheet on Escape — a dialog-like surface that traps scroll
  // should always be dismissible from the keyboard.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const navLinks = [
    { href: '/#features', label: 'Features' },
    { href: '/#pricing', label: 'Pricing' },
    { href: '/#about', label: 'About' },
    { href: '/#contact', label: 'Contact' },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileOpen(false);
    if (pathname === '/') {
      const anchor = href.replace('/', '');
      const element = document.querySelector(anchor);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.location.href = href;
    }
  };

  // The floating-pill treatment, shared by the desktop bar and the mobile bar so
  // the two never drift apart visually.
  const pillSurface = isScrolled || mobileOpen
    ? 'border-border/40 bg-background/70 shadow-lg shadow-foreground/[0.06] backdrop-blur-xl backdrop-saturate-150'
    : 'border-transparent bg-transparent shadow-none backdrop-blur-0';

  return (
    <>
      <nav
        suppressHydrationWarning
        className="fixed inset-x-0 top-0 z-50 w-full"
        // Promote to its own layer: the blur + shadow transition is composited
        // instead of repainting the hero underneath on every frame.
        style={{ willChange: 'transform' }}
      >
        {/* Desktop */}
        <div
          className={cn(
            'hidden md:block mx-auto max-w-7xl transition-[padding] duration-500 ease-out',
            isScrolled ? 'px-6 pt-3 lg:px-8' : 'px-6 pt-5 lg:px-8'
          )}
        >
          <div
            className={cn(
              'flex h-16 items-center justify-between border px-5',
              'transition-[background-color,border-color,box-shadow,border-radius,backdrop-filter] duration-500 ease-out',
              isScrolled ? 'rounded-full' : 'rounded-2xl',
              pillSurface
            )}
          >
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                <UtensilsCrossed className="h-4 w-4 text-primary" />
              </div>
              <span className="text-base font-bold tracking-tight text-primary">Resthru</span>
            </Link>

            <div className="flex items-center gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className="rounded-full px-3.5 py-2 text-[13px] font-medium text-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-primary"
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={SHARED_LOGIN_PATH}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-foreground/70 transition-colors hover:bg-primary/5 hover:text-primary"
              >
                Login
              </Link>
              <button
                type="button"
                onClick={() => setRegisterOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md active:scale-[0.98]"
              >
                Start Free Trial
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile */}
        <div className={cn('md:hidden transition-[padding] duration-500 ease-out', isScrolled ? 'px-3 pt-2' : 'px-4 pt-3')}>
          <div
            className={cn(
              'flex h-14 items-center justify-between border px-3',
              'transition-[background-color,border-color,box-shadow,border-radius,backdrop-filter] duration-500 ease-out',
              isScrolled || mobileOpen ? 'rounded-full' : 'rounded-2xl',
              pillSurface
            )}
          >
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <UtensilsCrossed className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-bold tracking-tight text-primary">Resthru</span>
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              // 44px hit target — the iOS/Android minimum for comfortable taps.
              className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/10"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu panel — a floating card under the pill, matching its
            language rather than a full-bleed bar welded to the viewport edge. */}
        {mobileOpen && (
          <div className="md:hidden px-3 pt-2">
            <div className="rounded-3xl border border-border/40 bg-background/95 p-2 shadow-xl shadow-foreground/10 backdrop-blur-xl">
              <div className="flex flex-col gap-0.5">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={(e) => handleNavClick(e, link.href)}
                    className="rounded-2xl px-4 py-3 text-[15px] font-medium text-foreground transition-colors hover:bg-primary/5 hover:text-primary active:bg-primary/10"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <div className="mt-2 flex flex-col gap-2 border-t border-border/40 pt-2">
                <Link
                  href={SHARED_LOGIN_PATH}
                  onClick={() => setMobileOpen(false)}
                  className="w-full rounded-2xl border border-border px-4 py-3 text-center text-[15px] font-medium transition-colors hover:bg-muted active:scale-[0.99]"
                >
                  Login
                </Link>
                <button
                  type="button"
                  onClick={() => { setMobileOpen(false); setRegisterOpen(true); }}
                  className="w-full rounded-2xl bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover active:scale-[0.99]"
                >
                  Start Free Trial
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <RegisterModal
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        // "Already have an account? Sign in" navigates to the one shared login
        // door. This used to open a LoginModal mounted here — a fifth copy of the
        // sign-in form, which is exactly what consolidating the login door removed.
        onSwitchToLogin={() => router.push(SHARED_LOGIN_PATH)}
      />

      {/* Flow spacer. The bar is fixed so it can sit transparently over the
          hero, which means it no longer occupies space the way the old sticky
          bar did. Pages that are not overlay pages get that space back here.
          Fixed height (no scroll-dependent value) so it can never cause CLS. */}
      {!overlay && <div aria-hidden className="h-[68px] md:h-[84px]" />}
    </>
  );
};

export default Navbar;
