import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // border-control, not border-strong: the edge that tells a user
          // "this is a field you can type in" has to clear 3:1 (WCAG
          // 1.4.11), and border-strong only manages 1.5:1 on white.
          'flex h-10 w-full rounded-input border border-border-control bg-card px-3 py-2 text-sm',
          'transition-[border-color,box-shadow] duration-150',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          // Full muted-foreground rather than a faded one. A placeholder is
          // often the only label a compact field has, so it has to be read,
          // not merely sensed; entered text is --foreground and still reads
          // as markedly heavier.
          'placeholder:text-muted-foreground',
          // Focus reads as a tinted ring on the border itself rather than an
          // offset halo, which kept clipping inside dense form grids.
          'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12',
          'hover:border-foreground/35',
          'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
          'aria-[invalid=true]:border-error aria-[invalid=true]:ring-4 aria-[invalid=true]:ring-error/12',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
