import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Status badges are read at a glance across every portal, so the tinted
// variants pair a -surface background with -strong text (all >= 4.5:1) rather
// than putting small text on a saturated fill. Badges are labels, not
// controls: no hover state, since most are not interactive and a hover
// affordance on static text is misleading.
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-normal whitespace-nowrap [&_svg]:h-3 [&_svg]:w-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground',
        brand: 'border-transparent bg-brand text-brand-foreground',
        outline: 'border-border-strong text-foreground',

        /* Tinted semantic set -- the default choice for status. */
        success: 'border-success/20 bg-success-surface text-success-strong',
        warning: 'border-warning/20 bg-warning-surface text-warning-strong',
        error: 'border-error/20 bg-error-surface text-error-strong',
        info: 'border-info/20 bg-info-surface text-info-strong',
        neutral: 'border-border-strong bg-muted text-muted-foreground',
        accentSoft: 'border-brand/20 bg-brand-light text-brand-strong',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
