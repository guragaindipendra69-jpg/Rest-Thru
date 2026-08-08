import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /* Tailwind 3's default opacity scale jumps 5,10,20,25,30... so an
         off-scale modifier like `bg-primary/15` compiles to nothing at all
         and the element silently renders with no background. The codebase
         had 48 such utilities (/8, /12, /15, /35, /85). Enumerating every
         integer makes them all resolve; JIT only emits the ones used, so
         there is no CSS weight cost. */
      opacity: Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [i, String(i / 100)])
      ),
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Playfair Display', 'Cormorant Garamond', 'ui-serif', 'Georgia', 'serif'],
        display: ['Cormorant Garamond', 'Playfair Display', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        sunken: 'hsl(var(--sunken))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
          hi: 'hsl(var(--primary-hi))',
          light: 'hsl(var(--primary-light))',
          deep: 'hsl(var(--primary-deep))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        /* Neutral interaction surface. shadcn primitives resolve every
           hover:/focus: state to this, so it must stay quiet. Decorative
           pop belongs to `brand`. See the note in globals.css. */
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        /* The pop. `brand` is a fill (dots, glows, gradients, bars);
           `brand-strong` is the text/icon variant that clears 4.5:1 on
           a light surface. Coral takes dark text, hence brand-foreground. */
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          foreground: 'hsl(var(--brand-foreground))',
          strong: 'hsl(var(--brand-strong))',
          light: 'hsl(var(--brand-light))',
        },
        rating: 'hsl(var(--rating))',
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          strong: 'hsl(var(--destructive-strong))',
          surface: 'hsl(var(--destructive-surface))',
        },
        /* Semantic triads. Pair as `bg-x-surface text-x-strong`; never
           put small text on the bare DEFAULT fill. */
        success: {
          DEFAULT: 'hsl(var(--success))',
          strong: 'hsl(var(--success-strong))',
          surface: 'hsl(var(--success-surface))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          strong: 'hsl(var(--warning-strong))',
          surface: 'hsl(var(--warning-surface))',
        },
        error: {
          DEFAULT: 'hsl(var(--error))',
          strong: 'hsl(var(--error-strong))',
          surface: 'hsl(var(--error-surface))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          strong: 'hsl(var(--info-strong))',
          surface: 'hsl(var(--info-surface))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: {
          DEFAULT: 'hsl(var(--border))',
          strong: 'hsl(var(--border-strong))',
          control: 'hsl(var(--control-border))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        /* book menu colors */
        paper: 'var(--paper)',
        'paper-warm': 'var(--paper-warm)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-mute': 'var(--ink-mute)',
        burgundy: 'var(--burgundy)',
        'burgundy-deep': 'var(--burgundy-deep)',
        gold: 'var(--gold)',
        'gold-soft': 'var(--gold-soft)',
        rule: 'var(--rule)',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
          '6': 'hsl(var(--chart-6))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          raised: 'hsl(var(--sidebar-raised))',
          foreground: 'hsl(var(--sidebar-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          muted: 'hsl(var(--sidebar-muted))',
          border: 'hsl(var(--sidebar-border))',
          danger: 'hsl(var(--sidebar-danger))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: '12px',
        button: '8px',
        input: '6px',
      },
      /* Elevation ladder. Every step is tinted with --shadow-color (a deep
         green) instead of pure black, so a raised surface stays in the
         palette rather than greying out what sits under it. Two layers per
         step: a tight contact shadow plus a wider ambient one. */
      boxShadow: {
        xs: '0 1px 2px -1px hsl(var(--shadow-color) / 0.08)',
        soft: '0 1px 3px -1px hsl(var(--shadow-color) / 0.10), 0 2px 8px -3px hsl(var(--shadow-color) / 0.06)',
        'soft-lg': '0 4px 12px -3px hsl(var(--shadow-color) / 0.10), 0 2px 6px -2px hsl(var(--shadow-color) / 0.06)',
        lifted: '0 10px 30px -12px hsl(var(--shadow-color) / 0.16), 0 4px 10px -4px hsl(var(--shadow-color) / 0.07)',
        floating: '0 24px 48px -12px hsl(var(--shadow-color) / 0.18), 0 8px 16px -8px hsl(var(--shadow-color) / 0.09)',
        glow: '0 0 0 1px hsl(var(--primary) / 0.12), 0 8px 24px -8px hsl(var(--primary) / 0.28)',
        'glow-emerald': '0 0 0 1px hsl(var(--primary-hi) / 0.14), 0 8px 24px -8px hsl(var(--primary-hi) / 0.30)',
        'glow-brand': '0 0 0 1px hsl(var(--brand) / 0.16), 0 8px 24px -8px hsl(var(--brand) / 0.32)',
        'admin-card': '0 1px 3px -1px hsl(var(--shadow-color) / 0.10), 0 2px 8px -3px hsl(var(--shadow-color) / 0.06)',
        'admin-card-hover': '0 10px 30px -12px hsl(var(--shadow-color) / 0.16), 0 4px 10px -4px hsl(var(--shadow-color) / 0.07)',
        'admin-glow': '0 0 20px hsl(var(--primary-hi) / 0.15)',
        'admin-glow-lg': '0 0 40px hsl(var(--primary-hi) / 0.10)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-primary':
          'linear-gradient(100deg, hsl(var(--primary)), hsl(var(--primary-hi)))',
        'gradient-dark':
          'linear-gradient(180deg, hsl(var(--primary)), hsl(var(--primary-hover)))',
        'gradient-brand':
          'linear-gradient(100deg, hsl(var(--brand)), hsl(var(--rating)))',
        'gradient-admin':
          'linear-gradient(135deg, hsl(var(--primary-hi)), hsl(var(--primary)))',
        'gradient-admin-subtle':
          'linear-gradient(180deg, transparent, hsl(var(--primary-hi) / 0.05))',
        /* Dark chrome for the dashboard sidebars. */
        'gradient-sidebar':
          'linear-gradient(180deg, hsl(var(--sidebar-raised)), hsl(var(--sidebar)))',
        /* Faint tinted mesh for marketing and auth backdrops. */
        'gradient-mesh':
          'radial-gradient(at 20% 15%, hsl(var(--primary-hi) / 0.10) 0px, transparent 50%), radial-gradient(at 80% 10%, hsl(var(--brand) / 0.08) 0px, transparent 50%), radial-gradient(at 60% 90%, hsl(var(--rating) / 0.06) 0px, transparent 50%)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 2s infinite linear',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
