import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Hover changes the *surface*, never the text colour, so contrast can only
// improve on hover. Solid variants darken to a dedicated -hover token rather
// than fading with /90 -- opacity lets whatever sits behind the button bleed
// through and mute the label, which is unpredictable across surfaces.
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'text-sm font-medium leading-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    // Tactile press. Suppressed under prefers-reduced-motion by the
    // motion-reduce variant so the affordance degrades gracefully.
    'active:translate-y-px motion-reduce:active:translate-y-0',
    'disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none',
    '[&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover hover:shadow-soft',
        destructive:
          'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive-strong hover:shadow-soft',
        // The pop. Coral carries dark text, not white -- white on #FF6B4A is
        // only 2.8:1 and fails AA.
        brand:
          'bg-brand text-brand-foreground shadow-xs hover:bg-brand-strong hover:text-white hover:shadow-soft',
        success:
          'bg-success text-white shadow-xs hover:bg-success-strong hover:shadow-soft',
        outline:
          'border border-border-strong bg-card text-foreground shadow-xs hover:bg-accent hover:border-border-strong hover:shadow-soft',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-muted hover:shadow-xs',
        // Tinted low-emphasis action: reads as primary without the weight.
        soft: 'bg-primary-light text-primary hover:bg-primary/15',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline hover:text-primary-hover',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8 text-[15px]',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
