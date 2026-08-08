'use client';

import React, { memo } from 'react';
import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface NavItem {
  label: string;
  href: string;
  Icon: React.ElementType;
}

interface SharedNavLinkProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}

export const SharedNavLink = memo(function SharedNavLink({
  item,
  active,
  collapsed,
}: SharedNavLinkProps) {
  const { Icon } = item;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={item.href} prefetch={true}>
          <div
            className={cn(
              'group flex items-center gap-3 rounded-lg transition-colors duration-150 cursor-pointer',
              collapsed ? 'justify-center w-10 h-10 mx-auto' : 'px-3 py-2.5',
              // Idle uses --sidebar-muted (the token built for ink on this
              // chrome) rather than a raw white/50, which came in a touch
              // under it. The hover tint is a white overlay, not a solid
              // token: the sidebar is a gradient, so a fixed background
              // would vanish wherever the gradient already matched it.
              active
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-white/[0.09]'
            )}
          >
            <Icon
              className={cn(
                'flex-shrink-0 h-[18px] w-[18px]',
                active
                  ? 'text-primary-foreground'
                  : 'text-sidebar-muted group-hover:text-sidebar-foreground'
              )}
            />
            {!collapsed && (
              <span className="text-[13px] font-medium whitespace-nowrap leading-none">
                {item.label}
              </span>
            )}
          </div>
        </Link>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right" className="font-medium">
          {item.label}
        </TooltipContent>
      )}
    </Tooltip>
  );
});
